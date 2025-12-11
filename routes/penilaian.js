const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const {
  requireAuth,
  requireAdminOrPengurus,
  requireUser,
} = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

// Hanya admin dan pengurus yang bisa akses route ini
router.use(requireAuth);
router.use(requireAdminOrPengurus);

// Route untuk detail penilaian per anggota - HARUS SEBELUM route "/" dan "/data"
router.get("/detail/:id", (req, res) => {
  const { id } = req.params;
  const bulan = req.query.bulan || new Date().getMonth() + 1;
  const tahun = req.query.tahun || new Date().getFullYear();

  // Validate ID
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).send("ID anggota tidak valid");
  }

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      if (err) {
        console.error("Error fetching organisasi:", err);
        organisasi = {};
      }

      // Get anggota data
      db.get("SELECT * FROM anggota WHERE id=?", [id], (err, anggota) => {
        if (err) {
          console.error("Error fetching anggota:", err);
          return res.status(500).send("Error database: " + err.message);
        }

        if (!anggota) {
          return res.status(404).send("Anggota tidak ditemukan");
        }

        // Get penilaian untuk anggota ini pada bulan dan tahun tertentu
        db.all(
          `SELECT 
            p.*,
            jp.nama as nama_jenis_penilaian,
            jp.deskripsi as deskripsi_jenis_penilaian
          FROM penilaian p
          INNER JOIN jenis_penilaian jp ON p.jenis_penilaian_id = jp.id
          WHERE p.anggota_id = ? AND p.bulan = ? AND p.tahun = ?
          ORDER BY jp.nama`,
          [id, bulan, tahun],
          (err, penilaian) => {
            if (err) {
              console.error("Error fetching penilaian:", err);
              penilaian = [];
            }

            // Get semua jenis penilaian aktif untuk referensi
            db.all(
              'SELECT * FROM jenis_penilaian WHERE status="aktif" ORDER BY id',
              [],
              (err, jenisPenilaian) => {
                if (err) {
                  console.error("Error fetching jenis penilaian:", err);
                  jenisPenilaian = [];
                }

                try {
                  // Set active flags based on user role
                  const userRole = req.session.user.role;
                  const active = {
                    penilaian: true,
                    isAdmin: userRole === "admin",
                    isAdminOrPengurus:
                      userRole === "admin" || userRole === "pengurus",
                    isUser: userRole === "user",
                  };

                  const layout = renderHTML("detailPenilaian.html", {
                    title: `Detail Penilaian - ${anggota.nama}`,
                    user: req.session.user,
                    active: active,
                    content: "",
                    organisasi: organisasi || {},
                  });

                  // Replace template variables
                  const anggotaJson = JSON.stringify(anggota || {});
                  const penilaianJson = JSON.stringify(penilaian || []);
                  const jenisPenilaianJson = JSON.stringify(
                    jenisPenilaian || []
                  );
                  const organisasiJson = JSON.stringify(organisasi || {});
                  let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
                  html = html.replace(/\{\{penilaian\}\}/g, penilaianJson);
                  html = html.replace(
                    /\{\{jenisPenilaian\}\}/g,
                    jenisPenilaianJson
                  );
                  html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
                  html = html.replace(/\{\{bulan\}\}/g, bulan);
                  html = html.replace(/\{\{tahun\}\}/g, tahun);
                  html = html.replace(
                    /\{\{user\.nama\}\}/g,
                    req.session.user.nama || ""
                  );
                  // Replace anggota individual fields
                  html = html.replace(
                    /\{\{anggota\.nama\}\}/g,
                    anggota.nama || ""
                  );
                  html = html.replace(
                    /\{\{anggota\.nik\}\}/g,
                    anggota.nik || "-"
                  );
                  html = html.replace(
                    /\{\{anggota\.alamat\}\}/g,
                    anggota.alamat || "-"
                  );
                  res.send(html);
                } catch (renderError) {
                  console.error("Error rendering HTML:", renderError);
                  res
                    .status(500)
                    .send("Error rendering halaman: " + renderError.message);
                }
              }
            );
          }
        );
      });
    }
  );
});

router.get("/", (req, res) => {
  const bulan = req.query.bulan || new Date().getMonth() + 1;
  const tahun = req.query.tahun || new Date().getFullYear();

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get semua anggota aktif dengan rata-rata penilaian
      db.all(
        `SELECT 
          a.*,
          COALESCE(AVG(p.nilai), 0) as rata_rata,
          COUNT(p.id) as jumlah_penilaian
        FROM anggota a
        LEFT JOIN penilaian p ON a.id = p.anggota_id AND p.bulan = ? AND p.tahun = ?
        WHERE a.status = 'aktif'
        GROUP BY a.id
        ORDER BY a.nama`,
        [bulan, tahun],
        (err, anggota) => {
          if (err) {
            console.error("Database error:", err);
            anggota = [];
          }

          // Set active flags based on user role
          const userRole = req.session.user.role;
          const active = {
            penilaian: true,
            isAdmin: userRole === "admin",
            isAdminOrPengurus: userRole === "admin" || userRole === "pengurus",
            isUser: userRole === "user",
          };

          const layout = renderHTML("penilaian.html", {
            title: "Penilaian Bulanan",
            user: req.session.user,
            active: active,
            content: "",
            organisasi: organisasi || {},
          });

          // Replace template variables
          const anggotaJson = JSON.stringify(anggota || []);
          const organisasiJson = JSON.stringify(organisasi || {});
          let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
          html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
          html = html.replace(/\{\{bulan\}\}/g, bulan);
          html = html.replace(/\{\{tahun\}\}/g, tahun);
          html = html.replace(
            /\{\{user\.nama\}\}/g,
            req.session.user.nama || ""
          );
          res.send(html);
        }
      );
    }
  );
});

router.get("/data", (req, res) => {
  const bulan = req.query.bulan || new Date().getMonth() + 1;
  const tahun = req.query.tahun || new Date().getFullYear();

  db.all(
    `SELECT p.*, a.nama as nama_anggota, jp.nama as nama_jenis_penilaian 
     FROM penilaian p
     INNER JOIN anggota a ON p.anggota_id = a.id
     INNER JOIN jenis_penilaian jp ON p.jenis_penilaian_id = jp.id
     WHERE p.bulan = ? AND p.tahun = ?
     ORDER BY a.nama, jp.nama`,
    [bulan, tahun],
    (err, penilaian) => {
      res.json(penilaian || []);
    }
  );
});

router.post("/create", (req, res) => {
  const { anggota_id, jenis_penilaian_id, bulan, tahun, nilai, keterangan } =
    req.body;

  if (
    !anggota_id ||
    !jenis_penilaian_id ||
    !bulan ||
    !tahun ||
    nilai === null ||
    nilai === undefined
  ) {
    return res.json({
      success: false,
      message: "Data tidak lengkap",
    });
  }

  // Check if penilaian already exists
  db.get(
    "SELECT id FROM penilaian WHERE anggota_id=? AND jenis_penilaian_id=? AND bulan=? AND tahun=?",
    [anggota_id, jenis_penilaian_id, bulan, tahun],
    (err, existing) => {
      if (err) {
        return res.json({ success: false, message: "Error database" });
      }

      if (existing) {
        // Update existing
        db.run(
          "UPDATE penilaian SET nilai=?, keterangan=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
          [parseFloat(nilai), keterangan || "", existing.id],
          (err) => {
            if (err) {
              return res.json({
                success: false,
                message: "Error update data",
              });
            }
            res.json({
              success: true,
              message: "Penilaian berhasil diupdate",
            });
          }
        );
      } else {
        // Insert new
        db.run(
          "INSERT INTO penilaian (anggota_id, jenis_penilaian_id, bulan, tahun, nilai, keterangan) VALUES (?, ?, ?, ?, ?, ?)",
          [
            anggota_id,
            jenis_penilaian_id,
            bulan,
            tahun,
            parseFloat(nilai),
            keterangan || "",
          ],
          function (err) {
            if (err) {
              if (err.message.includes("UNIQUE")) {
                return res.json({
                  success: false,
                  message: "Penilaian untuk anggota ini sudah ada",
                });
              }
              return res.json({
                success: false,
                message: "Error simpan data",
              });
            }
            res.json({
              success: true,
              message: "Penilaian berhasil ditambahkan",
            });
          }
        );
      }
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { nilai, keterangan } = req.body;

  if (nilai === null || nilai === undefined) {
    return res.json({ success: false, message: "Nilai wajib diisi" });
  }

  db.run(
    "UPDATE penilaian SET nilai=?, keterangan=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [parseFloat(nilai), keterangan || "", id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "Error update data" });
      }
      res.json({ success: true, message: "Penilaian berhasil diupdate" });
    }
  );
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM penilaian WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({ success: true, message: "Penilaian berhasil dihapus" });
  });
});

module.exports = router;
