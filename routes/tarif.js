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
      db.all("SELECT * FROM tarif ORDER BY id DESC", [], (err, tarif) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).send("Database error");
        }

        const layout = renderHTML("tarif.html", {
          title: "Data Tarif",
          user: req.session.user,
          active: { tarif: true, isAdminOrPengurus: true },
          content: "",
          organisasi: organisasi || {},
        });

        // Replace template variables
        const tarifJson = JSON.stringify(tarif || []);
        const organisasiJson = JSON.stringify(organisasi || {});
        let html = layout.replace(/\{\{tarif\}\}/g, tarifJson);
        html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
        html = html.replace(/\{\{user\.nama\}\}/g, req.session.user.nama || "");
        res.send(html);
      });
    }
  );
});

router.get("/data", (req, res) => {
  db.all("SELECT * FROM tarif ORDER BY id DESC", [], (err, tarif) => {
    res.json(tarif || []);
  });
});

router.post("/create", (req, res) => {
  const { nama, jumlah, keterangan, status } = req.body;

  if (!nama || !jumlah) {
    return res.json({ success: false, message: "Nama dan jumlah wajib diisi" });
  }

  db.run(
    "INSERT INTO tarif (nama, jumlah, keterangan, status) VALUES (?, ?, ?, ?)",
    [nama, jumlah, keterangan || "", status || "aktif"],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "Error simpan data" });
      }
      res.json({ success: true, message: "Tarif berhasil ditambahkan" });
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { nama, jumlah, keterangan, status } = req.body;

  if (!nama || !jumlah) {
    return res.json({ success: false, message: "Nama dan jumlah wajib diisi" });
  }

  db.run(
    "UPDATE tarif SET nama=?, jumlah=?, keterangan=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [nama, jumlah, keterangan || "", status || "aktif", id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "Error update data" });
      }
      res.json({ success: true, message: "Tarif berhasil diupdate" });
    }
  );
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM tarif WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({ success: true, message: "Tarif berhasil dihapus" });
  });
});

module.exports = router;
