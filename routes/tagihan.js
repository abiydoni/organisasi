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

            // Get tarif yang wajib dibayar oleh anggota ini
            db.all(
              `SELECT t.* FROM tarif t
               INNER JOIN anggota_tarif at ON t.id = at.tarif_id
               WHERE at.anggota_id = ?
               ORDER BY t.id DESC`,
              [anggota.id],
              (err, tarifAnggota) => {
                if (err) {
                  console.error("Error fetching tarif anggota:", err);
                  tarifAnggota = [];
                }

                // Get iuran data untuk tahun tertentu (untuk tabel bulanan)
                db.all(
                  "SELECT * FROM iuran WHERE anggota_id=? AND tahun=? ORDER BY bulan ASC",
                  [anggota.id, tahun],
                  (err, iuran) => {
                    if (err) {
                      console.error("Error fetching iuran:", err);
                      iuran = [];
                    }

                    // Get semua iuran (untuk tahunan dan seumur hidup)
                    db.all(
                      "SELECT * FROM iuran WHERE anggota_id=? ORDER BY tahun DESC, bulan ASC",
                      [anggota.id],
                      (err, semuaIuran) => {
                        if (err) {
                          console.error("Error fetching semua iuran:", err);
                          semuaIuran = [];
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
                            isAdminOrPengurusOrTentor: false,
                            isTentor: false,
                          };

                          const layout = renderHTML("tagihan.html", {
                            title: "Tagihan Iuran Saya",
                            user: req.session.user,
                            active: active,
                            content: "",
                            organisasi: organisasi || {},
                          });

                          // Replace template variables
                          // Ensure valid JSON by using try-catch
                          let anggotaJson,
                            iuranJson,
                            semuaIuranJson,
                            tarifJson,
                            tarifAnggotaJson;

                          try {
                            anggotaJson = JSON.stringify(anggota || {});
                            iuranJson = JSON.stringify(iuran || []);
                            semuaIuranJson = JSON.stringify(semuaIuran || []);
                            tarifJson = JSON.stringify(tarif || []);
                            tarifAnggotaJson = JSON.stringify(
                              tarifAnggota || []
                            );

                            // Validate JSON
                            JSON.parse(anggotaJson);
                            JSON.parse(iuranJson);
                            JSON.parse(semuaIuranJson);
                            JSON.parse(tarifJson);
                            JSON.parse(tarifAnggotaJson);
                          } catch (jsonError) {
                            console.error(
                              "Error stringifying JSON:",
                              jsonError
                            );
                            // Fallback to empty values
                            anggotaJson = "{}";
                            iuranJson = "[]";
                            semuaIuranJson = "[]";
                            tarifJson = "[]";
                            tarifAnggotaJson = "[]";
                          }

                          const organisasiJson = JSON.stringify(
                            organisasi || {}
                          );
                          // Replace template variables - ensure all are replaced
                          let html = layout;

                          // Replace organisasi template variables FIRST (before JSON variables)
                          // to avoid conflicts with {{organisasi}} JSON variable
                          if (organisasi) {
                            // Escape special characters for HTML attributes and JavaScript strings
                            const escapeHtml = (str) => {
                              if (!str) return "";
                              return String(str)
                                .replace(/&/g, "&amp;")
                                .replace(/</g, "&lt;")
                                .replace(/>/g, "&gt;")
                                .replace(/"/g, "&quot;")
                                .replace(/'/g, "&#039;");
                            };
                            const escapeJs = (str) => {
                              if (!str) return "";
                              return String(str)
                                .replace(/\\/g, "\\\\")
                                .replace(/"/g, '\\"')
                                .replace(/'/g, "\\'")
                                .replace(/\n/g, "\\n")
                                .replace(/\r/g, "\\r");
                            };

                            html = html.replace(
                              /\{\{organisasi\.nama\}\}/g,
                              escapeHtml(organisasi.nama || "")
                            );
                            html = html.replace(
                              /\{\{organisasi\.alamat\}\}/g,
                              escapeHtml(organisasi.alamat || "")
                            );
                            html = html.replace(
                              /\{\{organisasi\.telepon\}\}/g,
                              escapeHtml(organisasi.telepon || "")
                            );
                            html = html.replace(
                              /\{\{organisasi\.email\}\}/g,
                              escapeHtml(organisasi.email || "")
                            );
                            // Handle logo path - ensure it's a valid URL
                            const logoPath = organisasi.logo
                              ? organisasi.logo.startsWith("http")
                                ? organisasi.logo
                                : organisasi.logo
                              : "";
                            html = html.replace(
                              /\{\{organisasi\.logo\}\}/g,
                              escapeHtml(logoPath)
                            );
                            // Replace display style for logo
                            const logoDisplay = organisasi.logo
                              ? "block"
                              : "none";
                            html = html.replace(
                              /\{\{organisasi\.logo\}.*display:\s*\{\{organisasi\.logo\}\}/g,
                              `display: ${logoDisplay}`
                            );
                          } else {
                            // If no organisasi data, replace with empty strings
                            html = html.replace(
                              /\{\{organisasi\.nama\}\}/g,
                              ""
                            );
                            html = html.replace(
                              /\{\{organisasi\.alamat\}\}/g,
                              ""
                            );
                            html = html.replace(
                              /\{\{organisasi\.telepon\}\}/g,
                              ""
                            );
                            html = html.replace(
                              /\{\{organisasi\.email\}\}/g,
                              ""
                            );
                            html = html.replace(
                              /\{\{organisasi\.logo\}\}/g,
                              ""
                            );
                            html = html.replace(
                              /display:\s*\{\{organisasi\.logo\}\}/g,
                              "display: none"
                            );
                          }

                          // Replace JSON data variables
                          // JSON.stringify already produces valid JSON strings
                          // Inject them directly as JavaScript object/array literals
                          html = html.replace(/\{\{anggota\}\}/g, anggotaJson);
                          html = html.replace(/\{\{iuran\}\}/g, iuranJson);
                          html = html.replace(
                            /\{\{semuaIuran\}\}/g,
                            semuaIuranJson
                          );
                          html = html.replace(/\{\{tarif\}\}/g, tarifJson);
                          html = html.replace(
                            /\{\{tarifAnggota\}\}/g,
                            tarifAnggotaJson
                          );
                          html = html.replace(
                            /\{\{organisasi\}\}/g,
                            organisasiJson
                          );
                          html = html.replace(
                            /\{\{tahun\}\}/g,
                            tahun.toString()
                          );
                          html = html.replace(
                            /\{\{user\.nama\}\}/g,
                            req.session.user.nama || ""
                          );

                          // Final check: replace any remaining template variables
                          const remainingVars = html.match(/\{\{[^}]+\}\}/g);
                          if (remainingVars && remainingVars.length > 0) {
                            console.warn(
                              "Warning: Unreplaced template variables found:",
                              remainingVars
                            );
                            // Replace any remaining template variables with empty strings to avoid syntax errors
                            html = html.replace(/\{\{[^}]+\}\}/g, '""');
                          }

                          res.send(html);
                        } catch (renderError) {
                          console.error("Error rendering HTML:", renderError);
                          res
                            .status(500)
                            .send(
                              "Error rendering halaman: " + renderError.message
                            );
                        }
                      }
                    );
                  }
                );
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

      // Get only bulanan iuran for this month and year
      // Iuran tanpa frekuensi atau NULL dianggap bulanan
      db.all(
        "SELECT * FROM iuran WHERE anggota_id=? AND bulan=? AND tahun=? AND (frekuensi IS NULL OR frekuensi = '' OR LOWER(TRIM(frekuensi)) = 'bulanan') ORDER BY tanggal_bayar DESC, created_at DESC",
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

// Endpoint untuk mengambil detail pembayaran iuran lain (tahunan/seumur hidup)
router.get("/pembayaran-lain", (req, res) => {
  const { frekuensi, tarif_id, tahun } = req.query;

  // Get anggota data based on user
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
      if (!frekuensi || !tarif_id) {
        return res.status(400).json({
          success: false,
          message: "Frekuensi dan tarif_id harus diisi",
        });
      }

      if (!["tahunan", "seumur_hidup"].includes(frekuensi.toLowerCase())) {
        return res
          .status(400)
          .json({ success: false, message: "Frekuensi tidak valid" });
      }

      // Build query
      let query =
        "SELECT * FROM iuran WHERE anggota_id=? AND frekuensi=? AND tarif_id=?";
      let params = [anggota.id, frekuensi.toLowerCase(), tarif_id];

      // Jika tahunan, tambahkan filter tahun
      if (frekuensi.toLowerCase() === "tahunan") {
        const tahunFilter = tahun || new Date().getFullYear();
        if (!tahunFilter || isNaN(parseInt(tahunFilter))) {
          return res
            .status(400)
            .json({ success: false, message: "Tahun tidak valid" });
        }
        query += " AND tahun=?";
        params.push(tahunFilter);
      }

      query += " ORDER BY tanggal_bayar DESC, created_at DESC";

      db.all(query, params, (err, iuran) => {
        if (err) {
          console.error("Error fetching iuran detail:", err);
          return res.status(500).json({
            success: false,
            message: "Error database: " + err.message,
          });
        }

        res.json({ success: true, data: iuran || [] });
      });
    }
  );
});

module.exports = router;
