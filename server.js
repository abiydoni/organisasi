const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const db = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Session
app.use(
  session({
    secret: "organisasi-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 jam
  })
);

// Set views directory
app.set("views", path.join(__dirname, "views"));

// Import routes
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const organisasiRoutes = require("./routes/organisasi");
const userRoutes = require("./routes/user");
const anggotaRoutes = require("./routes/anggota");
const iuranRoutes = require("./routes/iuran");
const bukuKasRoutes = require("./routes/bukuKas");
const tagihanRoutes = require("./routes/tagihan");
const tarifRoutes = require("./routes/tarif");

// Routes
app.use("/auth", authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/organisasi", organisasiRoutes);
app.use("/user", userRoutes);
app.use("/anggota", anggotaRoutes);
app.use("/iuran", iuranRoutes);
app.use("/buku-kas", bukuKasRoutes);
app.use("/tagihan", tagihanRoutes);
app.use("/tarif", tarifRoutes);

// Root route
app.get("/", (req, res) => {
  if (req.session.user) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/auth/login");
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "views", "404.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
