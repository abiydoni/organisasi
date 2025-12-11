const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const {
  requireAuth,
  requireAdmin,
  requireAdminOrPengurus,
} = require("../middleware/auth");
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
        "SELECT id, username, nama, role, created_at FROM users ORDER BY id DESC",
        [],
        (err, users) => {
          // Get anggota data for dropdown
          db.all(
            "SELECT id, nama FROM anggota ORDER BY nama",
            [],
            (err, anggota) => {
              // Set active flags based on user role
              const userRole = req.session.user.role;
              const active = {
                user: true,
                isAdmin: userRole === "admin",
                isAdminOrPengurus:
                  userRole === "admin" || userRole === "pengurus",
                isUser: userRole === "user",
                isTentor: userRole === "tentor",
              };

              const layout = renderHTML("user.html", {
                title: "Data User",
                user: req.session.user,
                active: active,
                content: "",
                organisasi: organisasi || {},
              });
              // Replace template variables
              const usersJson = JSON.stringify(users || []);
              const anggotaJson = JSON.stringify(anggota || []);
              const organisasiJson = JSON.stringify(organisasi || {});
              let html = layout.replace(/\{\{users\}\}/g, usersJson);
              html = html.replace(/\{\{anggota\}\}/g, anggotaJson);
              html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
              html = html.replace(
                /\{\{user\.role\}\}/g,
                req.session.user.role || ""
              );
              html = html.replace(
                /\{\{user\.nama\}\}/g,
                req.session.user.nama || ""
              );
              html = html.replace(
                /\{\{user\.id\}\}/g,
                req.session.user.id || ""
              );
              res.send(html);
            }
          );
        }
      );
    }
  );
});

router.get("/data", (req, res) => {
  db.all(
    "SELECT id, username, nama, role, created_at FROM users ORDER BY id DESC",
    [],
    (err, users) => {
      res.json(users || []);
    }
  );
});

router.post("/create", (req, res) => {
  const { username, password, nama, role } = req.body;

  if (!username || !password || !nama) {
    return res.json({ success: false, message: "Data tidak lengkap" });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    "INSERT INTO users (username, password, nama, role) VALUES (?, ?, ?, ?)",
    [username, hashedPassword, nama, role || "user"],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) {
          return res.json({
            success: false,
            message: "Username sudah digunakan",
          });
        }
        return res.json({ success: false, message: "Error simpan data" });
      }
      res.json({ success: true, message: "User berhasil ditambahkan" });
    }
  );
});

router.get("/anggota", (req, res) => {
  db.all("SELECT id, nama FROM anggota ORDER BY nama", [], (err, anggota) => {
    res.json(anggota || []);
  });
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { nama, role } = req.body;
  const currentUser = req.session.user;

  // Validasi: hanya bisa update nama dan role, username tidak bisa diubah
  if (!nama) {
    return res.json({ success: false, message: "Nama wajib diisi" });
  }

  // Validasi role: hanya admin dan pengurus yang bisa mengubah role
  if (currentUser.role !== "admin" && currentUser.role !== "pengurus") {
    return res.json({
      success: false,
      message: "Anda tidak memiliki akses untuk mengubah role",
    });
  }

  // Get user yang akan diupdate untuk validasi lebih lanjut
  db.get("SELECT role FROM users WHERE id=?", [id], (err, targetUser) => {
    if (err || !targetUser) {
      return res.json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Validasi: hanya administrator yang bisa mengedit user administrator
    if (targetUser.role === "admin") {
      if (currentUser.role !== "admin") {
        return res.json({
          success: false,
          message: "Hanya administrator yang dapat mengedit user administrator",
        });
      }
    }

    // Validasi: pengurus hanya bisa mengubah role yang sama atau di bawahnya
    if (currentUser.role === "pengurus") {
      // Pengurus tidak bisa edit admin (sudah di-handle di atas)
      // Pengurus hanya bisa set role: pengurus, tentor, atau user (tidak bisa set admin)
      if (role === "admin") {
        return res.json({
          success: false,
          message: "Pengurus tidak dapat mengubah role menjadi admin",
        });
      }
    }

    db.run(
      "UPDATE users SET nama=?, role=? WHERE id=?",
      [nama, role, id],
      (err) => {
        if (err) {
          return res.json({ success: false, message: "Error update data" });
        }
        res.json({ success: true, message: "User berhasil diupdate" });
      }
    );
  });
});

router.put("/change-password/:id", (req, res) => {
  // Hanya admin yang bisa ubah password
  if (req.session.user.role !== "admin") {
    return res.json({
      success: false,
      message: "Hanya admin yang dapat mengubah password",
    });
  }
  const { id } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.json({ success: false, message: "Password wajib diisi" });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    "UPDATE users SET password=? WHERE id=?",
    [hashedPassword, id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "Error update password" });
      }
      res.json({ success: true, message: "Password berhasil diubah" });
    }
  );
});

router.delete("/delete/:id", (req, res) => {
  // Hanya admin dan pengurus yang bisa hapus user
  const currentUser = req.session.user;
  if (currentUser.role !== "admin" && currentUser.role !== "pengurus") {
    return res.json({
      success: false,
      message: "Anda tidak memiliki akses untuk menghapus user",
    });
  }
  const { id } = req.params;

  // Validasi: user aktif tidak dapat menghapus akunnya sendiri
  if (parseInt(id) === currentUser.id) {
    return res.json({
      success: false,
      message: "Tidak dapat menghapus akun sendiri",
    });
  }

  // Get user yang akan dihapus untuk validasi
  db.get("SELECT role FROM users WHERE id=?", [id], (err, targetUser) => {
    if (err || !targetUser) {
      return res.json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Validasi: pengurus tidak bisa hapus user admin
    if (currentUser.role === "pengurus" && targetUser.role === "admin") {
      return res.json({
        success: false,
        message: "Pengurus tidak dapat menghapus user administrator",
      });
    }

    db.run("DELETE FROM users WHERE id=?", [id], (err) => {
      if (err) {
        return res.json({ success: false, message: "Error hapus data" });
      }
      res.json({ success: true, message: "User berhasil dihapus" });
    });
  });
});

module.exports = router;
