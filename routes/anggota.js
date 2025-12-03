const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth, requireAdminOrPengurus } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);
// Hanya admin dan pengurus yang bisa akses
router.use(requireAdminOrPengurus);

router.get("/", (req, res) => {
  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      db.all("SELECT * FROM anggota ORDER BY id DESC", [], (err, anggota) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).send("Database error");
        }

        const layout = renderHTML("anggota.html", {
          title: "Data Anggota",
          user: req.session.user,
          active: { anggota: true, isAdminOrPengurus: true },
          content: "",
          organisasi: organisasi || {},
        });

        // Replace template variables
        const anggotaJson = JSON.stringify(anggota || []);
        const organisasiJson = JSON.stringify(organisasi || {});
        let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
        html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
        html = html.replace(/\{\{user\.nama\}\}/g, req.session.user.nama || "");
        res.send(html);
      });
    }
  );
});

router.get("/data", (req, res) => {
  db.all("SELECT * FROM anggota ORDER BY id DESC", [], (err, anggota) => {
    res.json(anggota || []);
  });
});

router.post("/create", (req, res) => {
  const { nama, nik, alamat, telepon, email, tanggal_bergabung, status } =
    req.body;

  db.run(
    "INSERT INTO anggota (nama, nik, alamat, telepon, email, tanggal_bergabung, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [nama, nik, alamat, telepon, email, tanggal_bergabung, status || "aktif"],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "Error simpan data" });
      }
      res.json({ success: true, message: "Anggota berhasil ditambahkan" });
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { nama, nik, alamat, telepon, email, tanggal_bergabung, status } =
    req.body;

  db.run(
    "UPDATE anggota SET nama=?, nik=?, alamat=?, telepon=?, email=?, tanggal_bergabung=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [nama, nik, alamat, telepon, email, tanggal_bergabung, status, id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "Error update data" });
      }
      res.json({ success: true, message: "Anggota berhasil diupdate" });
    }
  );
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM anggota WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({ success: true, message: "Anggota berhasil dihapus" });
  });
});

router.get("/detail/:id", (req, res) => {
  const { id } = req.params;
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

        // Get semua tarif
        db.all("SELECT * FROM tarif ORDER BY id DESC", [], (err, tarif) => {
          if (err) {
            console.error("Error fetching tarif:", err);
            tarif = [];
          }

          // Get iuran data untuk tahun tertentu
          db.all(
            "SELECT * FROM iuran WHERE anggota_id=? AND tahun=? ORDER BY bulan ASC",
            [id, tahun],
            (err, iuran) => {
              if (err) {
                console.error("Error fetching iuran:", err);
                iuran = [];
              }

              try {
                const layout = renderHTML("detailAnggota.html", {
                  title: `Detail Anggota - ${anggota.nama}`,
                  user: req.session.user,
                  active: { anggota: true, isAdminOrPengurus: true },
                  content: "",
                  organisasi: organisasi || {},
                });

                // Replace template variables
                const anggotaJson = JSON.stringify(anggota || {});
                const iuranJson = JSON.stringify(iuran || []);
                const tarifJson = JSON.stringify(tarif || []);
                const organisasiJson = JSON.stringify(organisasi || {});
                let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
                html = html.replace(/\{\{iuran\}\}/g, iuranJson);
                html = html.replace(/\{\{tarif\}\}/g, tarifJson);
                html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
                html = html.replace(/\{\{tahun\}\}/g, tahun);
                html = html.replace(
                  /\{\{user\.nama\}\}/g,
                  req.session.user.nama || ""
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
        });
      });
    }
  );
});

module.exports = router;
