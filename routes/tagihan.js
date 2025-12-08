const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireUser } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireUser);

router.get("/", (req, res) => {
  const tahun = req.query.tahun || new Date().getFullYear();

  // Get anggota data based on user
  // Try to find by nama (case-insensitive) first, then by email if available
  db.get(
    "SELECT * FROM anggota WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1",
    [req.session.user.nama],
    (err, anggota) => {
      if (err) {
        console.error("Error fetching anggota:", err);
        return res.status(500).send("Error database: " + err.message);
      }

      // If not found by nama, try to find by email (if user has email in session or can be matched)
      if (!anggota) {
        // Try alternative: check if there's a way to match via other fields
        // For now, we'll show a more helpful error message
        console.warn(
          `Anggota not found for user: ${req.session.user.nama}. User ID: ${req.session.user.id}`
        );
        return res.send(
          `<div style="padding: 20px; text-align: center;">
            <h1 style="color: #dc2626; margin-bottom: 10px;">Anggota Tidak Ditemukan</h1>
            <p style="color: #6b7280; margin-bottom: 20px;">
              Data anggota dengan nama "<strong>${req.session.user.nama}</strong>" tidak ditemukan dalam sistem.
            </p>
            <p style="color: #6b7280;">
              Silakan hubungi administrator untuk menghubungkan akun Anda dengan data anggota.
            </p>
            <a href="/auth/logout" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px;">
              Logout
            </a>
          </div>`
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
                  // Set active flags based on user role
                  const userRole = req.session.user.role;
                  const active = {
                    tagihan: true,
                    isAdmin: userRole === "admin",
                    isAdminOrPengurus:
                      userRole === "admin" || userRole === "pengurus",
                    isUser: userRole === "user",
                  };

                  const layout = renderHTML("tagihan.html", {
                    title: "Tagihan Iuran Saya",
                    user: req.session.user,
                    active: active,
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

                  // Replace organisasi template variables directly from database
                  if (organisasi) {
                    html = html.replace(
                      /\{\{organisasi\.nama\}\}/g,
                      organisasi.nama || ""
                    );
                    html = html.replace(
                      /\{\{organisasi\.alamat\}\}/g,
                      organisasi.alamat || ""
                    );
                    html = html.replace(
                      /\{\{organisasi\.telepon\}\}/g,
                      organisasi.telepon || ""
                    );
                    html = html.replace(
                      /\{\{organisasi\.email\}\}/g,
                      organisasi.email || ""
                    );
                    // Handle logo path - ensure it's a valid URL
                    const logoPath = organisasi.logo
                      ? organisasi.logo.startsWith("http")
                        ? organisasi.logo
                        : organisasi.logo
                      : "";
                    html = html.replace(/\{\{organisasi\.logo\}\}/g, logoPath);
                    // Replace display style for logo
                    const logoDisplay = organisasi.logo ? "block" : "none";
                    html = html.replace(
                      /\{\{organisasi\.logo\}.*display:\s*\{\{organisasi\.logo\}\}/g,
                      `display: ${logoDisplay}`
                    );
                  } else {
                    // If no organisasi data, replace with empty strings
                    html = html.replace(/\{\{organisasi\.nama\}\}/g, "");
                    html = html.replace(/\{\{organisasi\.alamat\}\}/g, "");
                    html = html.replace(/\{\{organisasi\.telepon\}\}/g, "");
                    html = html.replace(/\{\{organisasi\.email\}\}/g, "");
                    html = html.replace(/\{\{organisasi\.logo\}\}/g, "");
                    html = html.replace(
                      /display:\s*\{\{organisasi\.logo\}\}/g,
                      "display: none"
                    );
                  }

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
  // Try to find by nama (case-insensitive)
  db.get(
    "SELECT * FROM anggota WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1",
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
            return res.status(500).json({
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
