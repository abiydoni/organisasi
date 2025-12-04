const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth, requireAdminOrPengurus } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

// Helper function untuk mendapatkan nama bulan dengan kapitalisasi
function getNamaBulan(bulan) {
  const bulanNames = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return bulanNames[parseInt(bulan)] || bulan;
}

router.use(requireAuth);
// Hanya admin dan pengurus yang bisa akses
router.use(requireAdminOrPengurus);

router.get("/", (req, res) => {
  const tahun = req.query.tahun || new Date().getFullYear();

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get all iuran for the year
      db.all(
        `SELECT i.*, a.nama as nama_anggota 
        FROM iuran i 
        LEFT JOIN anggota a ON i.anggota_id = a.id 
        WHERE i.tahun = ?
        ORDER BY i.bulan ASC, i.id ASC`,
        [tahun],
        (err, iuran) => {
          // Get all anggota (not just aktif)
          db.all("SELECT * FROM anggota ORDER BY nama", [], (err, anggota) => {
            // Get all tarif
            db.all(
              'SELECT * FROM tarif WHERE status = "aktif"',
              [],
              (err, tarif) => {
                const layout = renderHTML("iuran.html", {
                  title: "Informasi Pembayaran",
                  user: req.session.user,
                  active: { iuran: true, isAdminOrPengurus: true },
                  content: "",
                  organisasi: organisasi || {},
                });
                // Replace template variables
                const iuranJson = JSON.stringify(iuran || []);
                const anggotaJson = JSON.stringify(anggota || []);
                const tarifJson = JSON.stringify(tarif || []);
                const organisasiJson = JSON.stringify(organisasi || {});
                let html = layout.replace(/\{\{iuran\}\}/g, iuranJson);
                html = html.replace(/\{\{anggota\}\}/g, anggotaJson);
                html = html.replace(/\{\{tarif\}\}/g, tarifJson);
                html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
                html = html.replace(/\{\{tahun\}\}/g, tahun);
                html = html.replace(
                  /\{\{user\.nama\}\}/g,
                  req.session.user.nama || ""
                );
                res.send(html);
              }
            );
          });
        }
      );
    }
  );
});

router.get("/data", (req, res) => {
  db.all(
    `SELECT i.*, a.nama as nama_anggota 
    FROM iuran i 
    LEFT JOIN anggota a ON i.anggota_id = a.id 
    ORDER BY i.tahun DESC, i.bulan DESC`,
    [],
    (err, iuran) => {
      res.json(iuran || []);
    }
  );
});

router.post("/create", (req, res) => {
  const {
    anggota_id,
    bulan,
    tahun,
    jumlah,
    tanggal_bayar,
    status,
    keterangan,
  } = req.body;

  // Pastikan anggota_id adalah integer
  const anggotaIdInt = parseInt(anggota_id);
  console.log(
    "Creating iuran - anggota_id:",
    anggotaIdInt,
    "type:",
    typeof anggotaIdInt
  );

  db.run(
    `INSERT INTO iuran (anggota_id, bulan, tahun, jumlah, tanggal_bayar, status, keterangan) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      anggotaIdInt,
      bulan,
      tahun,
      jumlah,
      tanggal_bayar,
      status || "lunas",
      keterangan,
    ],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "Error simpan data" });
      }

      // Auto insert ke buku kas sebagai debet
      if (status === "lunas" && jumlah > 0) {
        // Get anggota name
        db.get(
          "SELECT nama FROM anggota WHERE id = ?",
          [anggotaIdInt],
          (err, anggota) => {
            if (err) {
              console.error(
                "Error mengambil data anggota:",
                err,
                "anggota_id:",
                anggotaIdInt
              );
              // Tetap lanjutkan dengan "Unknown" jika error
            }

            // Pastikan nama anggota ada
            if (!anggota || !anggota.nama) {
              console.error("Anggota tidak ditemukan untuk id:", anggotaIdInt);
            }

            const namaAnggota = anggota?.nama || "Unknown";
            console.log(
              "Nama anggota untuk buku_kas:",
              namaAnggota,
              "dari anggota_id:",
              anggotaIdInt,
              "anggota object:",
              anggota
            );

            const namaBulan = getNamaBulan(bulan);
            let keteranganBukuKas = `Iuran ${namaBulan} - ${namaAnggota}`;

            console.log(
              "Keterangan buku_kas yang akan disimpan:",
              keteranganBukuKas
            );

            // Tambahkan keterangan dari form jika ada
            if (keterangan && keterangan.trim()) {
              keteranganBukuKas += `\n${keterangan.trim()}`;
            }

            // Get last saldo
            db.get(
              "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
              [],
              (err, lastRow) => {
                if (err) {
                  console.error("Error mengambil saldo:", err);
                }
                const lastSaldo = lastRow?.saldo || 0;
                const newSaldo = lastSaldo + parseInt(jumlah);

                db.run(
                  `INSERT INTO buku_kas (tanggal, keterangan, kategori, debet, kredit, saldo) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    tanggal_bayar || new Date().toISOString().split("T")[0],
                    keteranganBukuKas,
                    "iuran",
                    parseInt(jumlah),
                    0,
                    newSaldo,
                  ],
                  (err) => {
                    if (err) {
                      console.error("Error insert buku_kas:", err);
                    }
                  }
                );
              }
            );
          }
        );
      }

      res.json({ success: true, message: "Iuran berhasil ditambahkan" });
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const {
    anggota_id,
    bulan,
    tahun,
    jumlah,
    tanggal_bayar,
    status,
    keterangan,
  } = req.body;

  db.run(
    `UPDATE iuran SET anggota_id=?, bulan=?, tahun=?, jumlah=?, tanggal_bayar=?, status=?, keterangan=? WHERE id=?`,
    [anggota_id, bulan, tahun, jumlah, tanggal_bayar, status, keterangan, id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "Error update data" });
      }
      res.json({ success: true, message: "Iuran berhasil diupdate" });
    }
  );
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  // Get iuran data first to get jumlah for buku_kas adjustment
  db.get("SELECT * FROM iuran WHERE id=?", [id], (err, iuranData) => {
    if (err || !iuranData) {
      return res.json({ success: false, message: "Iuran tidak ditemukan" });
    }

    // Delete iuran
    db.run("DELETE FROM iuran WHERE id=?", [id], (err) => {
      if (err) {
        return res.json({ success: false, message: "Error hapus data" });
      }

      // If iuran was lunas, need to adjust buku_kas (reverse the debet)
      if (iuranData.status === "lunas" && iuranData.jumlah > 0) {
        // Get anggota name
        db.get(
          "SELECT nama FROM anggota WHERE id = ?",
          [iuranData.anggota_id],
          (err, anggota) => {
            if (err) {
              console.error(
                "Error mengambil data anggota:",
                err,
                "anggota_id:",
                anggota_id
              );
            }

            const namaAnggota = anggota?.nama || "Unknown";
            console.log(
              "Nama anggota untuk buku_kas:",
              namaAnggota,
              "dari anggota_id:",
              anggota_id
            );
            const namaBulan = getNamaBulan(iuranData.bulan);
            const keteranganBukuKas = `Pembatalan iuran ${namaBulan} - ${namaAnggota}`;

            // Get last saldo
            db.get(
              "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
              [],
              (err, lastRow) => {
                const lastSaldo = lastRow?.saldo || 0;
                const newSaldo = Math.max(
                  0,
                  lastSaldo - parseInt(iuranData.jumlah)
                );

                // Insert reverse entry (kredit)
                db.run(
                  `INSERT INTO buku_kas (tanggal, keterangan, kategori, debet, kredit, saldo) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    new Date().toISOString().split("T")[0],
                    keteranganBukuKas,
                    "iuran",
                    0,
                    parseInt(iuranData.jumlah),
                    newSaldo,
                  ]
                );
              }
            );
          }
        );
      }

      res.json({ success: true, message: "Iuran berhasil dihapus" });
    });
  });
});

// Endpoint untuk menghapus semua pembayaran bulan tertentu
router.delete("/delete-bulan/:anggota_id/:bulan/:tahun", (req, res) => {
  const { anggota_id, bulan, tahun } = req.params;

  // Get all iuran for this month to calculate total for buku_kas adjustment
  db.all(
    "SELECT * FROM iuran WHERE anggota_id=? AND bulan=? AND tahun=?",
    [anggota_id, bulan, tahun],
    (err, iuranList) => {
      if (err) {
        return res.json({
          success: false,
          message: "Error mengambil data iuran",
        });
      }

      if (!iuranList || iuranList.length === 0) {
        return res.json({
          success: false,
          message: "Tidak ada pembayaran untuk bulan ini",
        });
      }

      // Calculate total jumlah for buku_kas adjustment
      const totalJumlah = iuranList
        .filter((i) => i.status === "lunas" && i.jumlah > 0)
        .reduce((sum, i) => sum + parseInt(i.jumlah || 0), 0);

      // Delete all iuran for this month
      db.run(
        "DELETE FROM iuran WHERE anggota_id=? AND bulan=? AND tahun=?",
        [anggota_id, bulan, tahun],
        (err) => {
          if (err) {
            return res.json({ success: false, message: "Error hapus data" });
          }

          // If there were lunas payments, adjust buku_kas (reverse the debet)
          if (totalJumlah > 0) {
            // Get anggota name
            db.get(
              "SELECT nama FROM anggota WHERE id = ?",
              [anggota_id],
              (err, anggota) => {
                if (err) {
                  return res.json({
                    success: false,
                    message: "Error mengambil data anggota",
                  });
                }

                const namaAnggota = anggota?.nama || "Unknown";
                const namaBulan = getNamaBulan(bulan);
                const keteranganBukuKas = `Pembatalan iuran ${namaBulan} - ${namaAnggota}`;

                // Get last saldo
                db.get(
                  "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
                  [],
                  (err, lastRow) => {
                    const lastSaldo = lastRow?.saldo || 0;
                    const newSaldo = Math.max(0, lastSaldo - totalJumlah);

                    // Insert reverse entry (kredit) for total
                    db.run(
                      `INSERT INTO buku_kas (tanggal, keterangan, kategori, debet, kredit, saldo) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
                      [
                        new Date().toISOString().split("T")[0],
                        keteranganBukuKas,
                        "iuran",
                        0,
                        totalJumlah,
                        newSaldo,
                      ]
                    );
                  }
                );
              }
            );
          }

          res.json({
            success: true,
            message: `Semua pembayaran untuk bulan ${bulan}/${tahun} berhasil dihapus`,
          });
        }
      );
    }
  );
});

module.exports = router;
