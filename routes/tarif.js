const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth, requireAdminOrPengurus } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");
const { logInsert, logUpdate, logDelete } = require("../utils/logger");

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

        // Set active flags based on user role
        const userRole = req.session.user.role;
        const active = {
          tarif: true,
          isAdmin: userRole === "admin",
          isAdminOrPengurus: userRole === "admin" || userRole === "pengurus",
          isUser: userRole === "user",
        };

        const layout = renderHTML("tarif.html", {
          title: "Data Tarif",
          user: req.session.user,
          active: active,
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
  const { nama, jumlah, keterangan, status, frekuensi } = req.body;

  if (!nama || !jumlah) {
    return res.json({ success: false, message: "Nama dan jumlah wajib diisi" });
  }

  db.run(
    "INSERT INTO tarif (nama, jumlah, frekuensi, keterangan, status) VALUES (?, ?, ?, ?, ?)",
    [nama, jumlah, frekuensi || "bulanan", keterangan || "", status || "aktif"],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "Error simpan data" });
      }

      logInsert(
        req,
        "tarif",
        this.lastID,
        `Menambahkan tarif: ${nama} (Rp ${parseInt(jumlah).toLocaleString(
          "id-ID"
        )}, ${frekuensi || "bulanan"})`,
        {
          nama,
          jumlah,
          frekuensi: frekuensi || "bulanan",
          keterangan,
          status: status || "aktif",
        }
      );

      res.json({ success: true, message: "Tarif berhasil ditambahkan" });
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { nama, jumlah, frekuensi, keterangan, status } = req.body;

  if (!nama || !jumlah) {
    return res.json({ success: false, message: "Nama dan jumlah wajib diisi" });
  }

  // Get old data for logging
  db.get("SELECT * FROM tarif WHERE id=?", [id], (err, oldData) => {
    if (err || !oldData) {
      return res.json({ success: false, message: "Tarif tidak ditemukan" });
    }

    db.run(
      "UPDATE tarif SET nama=?, jumlah=?, frekuensi=?, keterangan=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [
        nama,
        jumlah,
        frekuensi || "bulanan",
        keterangan || "",
        status || "aktif",
        id,
      ],
      (err) => {
        if (err) {
          return res.json({ success: false, message: "Error update data" });
        }

        logUpdate(req, "tarif", id, `Mengupdate tarif: ${nama}`, oldData, {
          nama,
          jumlah,
          frekuensi: frekuensi || "bulanan",
          keterangan,
          status: status || "aktif",
        });

        res.json({ success: true, message: "Tarif berhasil diupdate" });
      }
    );
  });
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  // Get old data for logging
  db.get("SELECT * FROM tarif WHERE id=?", [id], (err, oldData) => {
    if (err || !oldData) {
      return res.json({ success: false, message: "Tarif tidak ditemukan" });
    }

    db.run("DELETE FROM tarif WHERE id=?", [id], (err) => {
      if (err) {
        return res.json({ success: false, message: "Error hapus data" });
      }

      logDelete(req, "tarif", id, `Menghapus tarif: ${oldData.nama}`, oldData);

      res.json({ success: true, message: "Tarif berhasil dihapus" });
    });
  });
});

module.exports = router;
