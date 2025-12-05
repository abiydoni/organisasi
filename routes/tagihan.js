const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

router.get("/", (req, res) => {
  const tahun = req.query.tahun || new Date().getFullYear();

  // Get anggota data based on user
  db.get(
    "SELECT * FROM anggota WHERE nama = ? LIMIT 1",
    [req.session.user.nama],
    (err, anggota) => {
      if (err) {
        console.error("Error fetching anggota:", err);
        return res.status(500).send("Error database: " + err.message);
      }

      if (!anggota) {
        return res.send(
          "<h1>Anggota tidak ditemukan. Silakan hubungi administrator.</h1>"
        );
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

          // Get semua tarif
          db.all("SELECT * FROM tarif ORDER BY id DESC", [], (err, tarif) => {
            if (err) {
              console.error("Error fetching tarif:", err);
              tarif = [];
            }

            // Get iuran data untuk tahun tertentu
            db.all(
              "SELECT * FROM iuran WHERE anggota_id=? AND tahun=? ORDER BY bulan ASC",
              [anggota.id, tahun],
              (err, iuran) => {
                if (err) {
                  console.error("Error fetching iuran:", err);
                  iuran = [];
                }

                try {
                  const layout = renderHTML("tagihan.html", {
                    title: "Tagihan Iuran Saya",
                    user: req.session.user,
                    active: { tagihan: true, isUser: true },
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
        }
      );
    }
  );
});

// Endpoint untuk mengambil detail pembayaran per bulan
router.get("/pembayaran", (req, res) => {
  const { bulan, tahun } = req.query;

  // Get anggota data based on user
  db.get(
    "SELECT * FROM anggota WHERE nama = ? LIMIT 1",
    [req.session.user.nama],
    (err, anggota) => {
      if (err) {
        console.error("Error fetching anggota:", err);
        return res
          .status(500)
          .json({ success: false, message: "Error database: " + err.message });
      }

      if (!anggota) {
        return res
          .status(404)
          .json({ success: false, message: "Anggota tidak ditemukan" });
      }

      // Validate parameters
      if (!bulan || isNaN(parseInt(bulan)) || bulan < 1 || bulan > 12) {
        return res
          .status(400)
          .json({ success: false, message: "Bulan tidak valid" });
      }
      if (!tahun || isNaN(parseInt(tahun))) {
        return res
          .status(400)
          .json({ success: false, message: "Tahun tidak valid" });
      }

      // Get all iuran for this month and year
      db.all(
        "SELECT * FROM iuran WHERE anggota_id=? AND bulan=? AND tahun=? ORDER BY tanggal_bayar DESC, created_at DESC",
        [anggota.id, bulan, tahun],
        (err, iuran) => {
          if (err) {
            console.error("Error fetching iuran detail:", err);
            return res
              .status(500)
              .json({
                success: false,
                message: "Error database: " + err.message,
              });
          }

          res.json({ success: true, data: iuran || [] });
        }
      );
    }
  );
});

module.exports = router;
