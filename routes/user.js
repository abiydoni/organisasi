const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

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
          const layout = renderHTML("user.html", {
            title: "Data User",
            user: req.session.user,
            active: { user: true },
            content: "",
            organisasi: organisasi || {},
          });
          // Replace template variables
          const usersJson = JSON.stringify(users || []);
          const organisasiJson = JSON.stringify(organisasi || {});
          let html = layout.replace(/\{\{users\}\}/g, usersJson);
          html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
          html = html.replace(
            /\{\{user\.role\}\}/g,
            req.session.user.role || ""
          );
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
    "SELECT id, username, nama, role, created_at FROM users ORDER BY id DESC",
    [],
    (err, users) => {
      res.json(users || []);
    }
  );
});

router.post("/create", requireAdmin, (req, res) => {
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

router.put("/update/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { username, password, nama, role } = req.body;

  if (password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(
      "UPDATE users SET username=?, password=?, nama=?, role=? WHERE id=?",
      [username, hashedPassword, nama, role, id],
      (err) => {
        if (err) {
          return res.json({ success: false, message: "Error update data" });
        }
        res.json({ success: true, message: "User berhasil diupdate" });
      }
    );
  } else {
    db.run(
      "UPDATE users SET username=?, nama=?, role=? WHERE id=?",
      [username, nama, role, id],
      (err) => {
        if (err) {
          return res.json({ success: false, message: "Error update data" });
        }
        res.json({ success: true, message: "User berhasil diupdate" });
      }
    );
  }
});

router.delete("/delete/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.session.user.id) {
    return res.json({
      success: false,
      message: "Tidak dapat menghapus user sendiri",
    });
  }

  db.run("DELETE FROM users WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({ success: true, message: "User berhasil dihapus" });
  });
});

module.exports = router;
