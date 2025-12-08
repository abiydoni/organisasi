const express = require("express");
const router = express.Router();
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../config/database");

// Login page
router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "..", "views", "auth", "login.html"));
});

// Login process
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      return res.json({ success: false, message: "Error database" });
    }

    if (!user) {
      return res.json({
        success: false,
        message: "Username atau password salah",
      });
    }

    bcrypt.compare(password, user.password, (err, match) => {
      if (err || !match) {
        return res.json({
          success: false,
          message: "Username atau password salah",
        });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        nama: user.nama,
        role: user.role,
      };

      res.json({ success: true, message: "Login berhasil", role: user.role });
    });
  });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/auth/login");
});

module.exports = router;
