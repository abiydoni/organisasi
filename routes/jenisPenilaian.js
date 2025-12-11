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
      db.all(
        "SELECT * FROM jenis_penilaian ORDER BY id DESC",
        [],
        (err, jenisPenilaian) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Database error");
          }

          // Set active flags based on user role
          const userRole = req.session.user.role;
          const active = {
            jenisPenilaian: true,
            isAdmin: userRole === "admin",
            isAdminOrPengurus: userRole === "admin" || userRole === "pengurus",
            isUser: userRole === "user",
          };

          const layout = renderHTML("jenisPenilaian.html", {
            title: "Jenis Penilaian",
            user: req.session.user,
            active: active,
            content: "",
            organisasi: organisasi || {},
          });

          // Replace template variables
          const jenisPenilaianJson = JSON.stringify(jenisPenilaian || []);
          const organisasiJson = JSON.stringify(organisasi || {});
          let html = layout.replace(
            /\{\{jenisPenilaian\}\}/g,
            jenisPenilaianJson
          );
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
});

router.get("/data", (req, res) => {
  db.all(
    "SELECT * FROM jenis_penilaian ORDER BY id DESC",
    [],
    (err, jenisPenilaian) => {
      res.json(jenisPenilaian || []);
    }
  );
});

router.post("/create", (req, res) => {
  const { nama, deskripsi, bobot, status } = req.body;

  if (!nama) {
    return res.json({ success: false, message: "Nama wajib diisi" });
  }

  db.run(
    "INSERT INTO jenis_penilaian (nama, deskripsi, bobot, status) VALUES (?, ?, ?, ?)",
    [nama, deskripsi || "", parseFloat(bobot) || 1.0, status || "aktif"],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "Error simpan data" });
      }
      res.json({
        success: true,
        message: "Jenis penilaian berhasil ditambahkan",
      });
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { nama, deskripsi, bobot, status } = req.body;

  if (!nama) {
    return res.json({ success: false, message: "Nama wajib diisi" });
  }

  db.run(
    "UPDATE jenis_penilaian SET nama=?, deskripsi=?, bobot=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [nama, deskripsi || "", parseFloat(bobot) || 1.0, status || "aktif", id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "Error update data" });
      }
      res.json({
        success: true,
        message: "Jenis penilaian berhasil diupdate",
      });
    }
  );
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM jenis_penilaian WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({
      success: true,
      message: "Jenis penilaian berhasil dihapus",
    });
  });
});

module.exports = router;
