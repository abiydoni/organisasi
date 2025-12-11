const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const {
  requireAuth,
  requireUser,
  requireAdminOrPengurusOrTentor,
} = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

// Route untuk semua role (admin, pengurus, tentor, dan user)
router.get("/", (req, res) => {
  const userRole = req.session.user.role;

  // Cek apakah user memiliki akses
  const hasAccess =
    userRole === "admin" ||
    userRole === "pengurus" ||
    userRole === "tentor" ||
    userRole === "user";

  if (!hasAccess) {
    return res.status(403).send("Akses ditolak");
  }

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      db.all(
        "SELECT * FROM buku_kas ORDER BY tanggal DESC, id DESC",
        [],
        (err, bukuKas) => {
          db.get(
            "SELECT SUM(debet) as totalDebet, SUM(kredit) as totalKredit FROM buku_kas",
            [],
            (err, totals) => {
              db.get(
                "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
                [],
                (err, lastRow) => {
                  const stats = {
                    totalDebet: totals?.totalDebet || 0,
                    totalKredit: totals?.totalKredit || 0,
                    saldo: lastRow?.saldo || 0,
                  };

                  // Set active flags based on user role
                  const active = {
                    arusKas: true,
                    isAdmin: userRole === "admin",
                    isAdminOrPengurus:
                      userRole === "admin" || userRole === "pengurus",
                    isUser: userRole === "user",
                    isTentor: userRole === "tentor",
                    isAdminOrPengurusOrTentor:
                      userRole === "admin" ||
                      userRole === "pengurus" ||
                      userRole === "tentor",
                  };

                  const layout = renderHTML("arusKas.html", {
                    title: "Arus Kas",
                    user: req.session.user,
                    active: active,
                    content: "",
                    organisasi: organisasi || {},
                  });
                  // Replace template variables
                  const bukuKasJson = JSON.stringify(bukuKas || []);
                  const statsJson = JSON.stringify(stats);
                  const organisasiJson = JSON.stringify(organisasi || {});
                  let html = layout.replace(/\{\{bukuKas\}\}/g, bukuKasJson);
                  html = html.replace(/\{\{stats\}\}/g, statsJson);
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
    }
  );
});

module.exports = router;
