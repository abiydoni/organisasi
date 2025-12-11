const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireUser } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireUser);

router.get("/", (req, res) => {
  const bulan = req.query.bulan || new Date().getMonth() + 1;
  const tahun = req.query.tahun || new Date().getFullYear();

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      if (err) {
        console.error("Error fetching organisasi:", err);
        organisasi = {};
      }

      // Get anggota data berdasarkan nama user (sama seperti di tagihan.js)
      db.get(
        "SELECT * FROM anggota WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1",
        [req.session.user.nama],
        (err, anggota) => {
          if (err) {
            console.error("Error fetching anggota:", err);
            return res.status(500).send("Error database: " + err.message);
          }

          if (!anggota) {
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
            [anggota.id, bulan, tahun],
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
                      myPenilaian: true,
                      isAdmin: userRole === "admin",
                      isAdminOrPengurus:
                        userRole === "admin" || userRole === "pengurus",
                      isUser: userRole === "user",
                    };

                    const layout = renderHTML("myPenilaian.html", {
                      title: "Penilaian Saya",
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
        }
      );
    }
  );
});

module.exports = router;
