const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

router.get("/", (req, res) => {
  // Get anggota data based on user
  db.get(
    "SELECT * FROM anggota WHERE nama = ? LIMIT 1",
    [req.session.user.nama],
    (err, anggota) => {
      if (!anggota) {
        return res.send(
          "<h1>Anggota tidak ditemukan. Silakan hubungi administrator.</h1>"
        );
      }

      // Get iuran data for this anggota
      db.all(
        `SELECT i.*, a.nama as nama_anggota 
        FROM iuran i 
        LEFT JOIN anggota a ON i.anggota_id = a.id 
        WHERE i.anggota_id = ?
        ORDER BY i.tahun DESC, i.bulan DESC`,
        [anggota.id],
        (err, iuran) => {
          // Get organisasi data
          db.get(
            "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
            [],
            (err, organisasi) => {
              const layout = renderHTML("tagihan.html", {
                title: "Tagihan Iuran Saya",
                user: req.session.user,
                active: { tagihan: true },
                content: "",
                organisasi: organisasi || {},
              });
              // Replace template variables - inject JSON langsung (bukan sebagai string)
              const iuranJson = JSON.stringify(iuran || []);
              const anggotaJson = JSON.stringify(anggota || {});
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

module.exports = router;
