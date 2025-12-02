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
      // Get statistics
      db.get(
        "SELECT COUNT(*) as count FROM anggota",
        [],
        (err, anggotaResult) => {
          db.get(
            'SELECT COUNT(*) as count FROM iuran WHERE status = "lunas"',
            [],
            (err, iuranResult) => {
              db.get(
                "SELECT SUM(debet) as total FROM buku_kas",
                [],
                (err, debetResult) => {
                  db.get(
                    "SELECT SUM(kredit) as total FROM buku_kas",
                    [],
                    (err, kreditResult) => {
                      const stats = {
                        anggota: anggotaResult?.count || 0,
                        iuranLunas: iuranResult?.count || 0,
                        totalMasuk: debetResult?.total || 0,
                        totalKeluar: kreditResult?.total || 0,
                      };

                      const layout = renderHTML("dashboard.html", {
                        title: "Dashboard",
                        user: req.session.user,
                        active: { dashboard: true },
                        content: "",
                        organisasi: organisasi || {},
                      });

                      // Replace template variables
                      // Note: organisasi sudah di-inject di renderHTML, jadi tidak perlu replace lagi
                      const statsJson = JSON.stringify(stats);
                      let html = layout.replace(/\{\{stats\}\}/g, statsJson);
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
        }
      );
    }
  );
});

module.exports = router;
