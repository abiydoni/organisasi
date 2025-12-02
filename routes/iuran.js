const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

router.get("/", (req, res) => {
  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      db.all(
        `SELECT i.*, a.nama as nama_anggota 
        FROM iuran i 
        LEFT JOIN anggota a ON i.anggota_id = a.id 
        ORDER BY i.tahun DESC, i.bulan DESC, i.id DESC`,
        [],
        (err, iuran) => {
          db.all(
            'SELECT id, nama FROM anggota WHERE status = "aktif" ORDER BY nama',
            [],
            (err, anggota) => {
              const layout = renderHTML("iuran.html", {
                title: "Iuran Bulanan",
                user: req.session.user,
                active: { iuran: true },
                content: "",
                organisasi: organisasi || {},
              });
              // Replace template variables
              const iuranJson = JSON.stringify(iuran || []);
              const anggotaJson = JSON.stringify(anggota || []);
              const organisasiJson = JSON.stringify(organisasi || {});
              let html = layout.replace(/\{\{iuran\}\}/g, iuranJson);
              html = html.replace(/\{\{anggota\}\}/g, anggotaJson);
              html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
              html = html.replace(
                /\{\{user\.nama\}\}/g,
                req.session.user.nama || ""
              );
              res.send(html);
            }
          );
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

  db.run(
    `INSERT INTO iuran (anggota_id, bulan, tahun, jumlah, tanggal_bayar, status, keterangan) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      anggota_id,
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
        // Get last saldo
        db.get(
          "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
          [],
          (err, lastRow) => {
            const lastSaldo = lastRow?.saldo || 0;
            const newSaldo = lastSaldo + parseInt(jumlah);

            db.run(
              `INSERT INTO buku_kas (tanggal, keterangan, kategori, debet, kredit, saldo) 
              VALUES (?, ?, ?, ?, ?, ?)`,
              [
                tanggal_bayar || new Date().toISOString().split("T")[0],
                `Iuran bulanan - ${keterangan || ""}`,
                "iuran",
                parseInt(jumlah),
                0,
                newSaldo,
              ]
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

  db.run("DELETE FROM iuran WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({ success: true, message: "Iuran berhasil dihapus" });
  });
});

module.exports = router;
