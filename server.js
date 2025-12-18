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

// Middleware untuk set no-cache header pada halaman HTML dinamis
// HARUS SETELAH express.static agar tidak mempengaruhi static files
app.use((req, res, next) => {
  // Set no-cache untuk route dinamis (dashboard, anggota, iuran, dll)
  // Skip untuk static files (CSS, JS, images, dll) yang sudah di-handle oleh express.static
  const isStaticFile =
    req.path.startsWith("/css/") ||
    req.path.startsWith("/js/") ||
    req.path.startsWith("/icons/") ||
    req.path.startsWith("/uploads/") ||
    req.path.startsWith("/manifest.json") ||
    req.path.startsWith("/service-worker.js") ||
    req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)$/i);

  // Set no-cache untuk route dinamis (bukan static files)
  if (!isStaticFile && req.method === "GET") {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// Serve manifest.json with correct content-type
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/manifest+json");
  res.sendFile(path.join(__dirname, "public", "manifest.json"));
});

// Serve service-worker.js with correct content-type
app.get("/service-worker.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "public", "service-worker.js"));
});

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
const jenisPenilaianRoutes = require("./routes/jenisPenilaian");
const penilaianRoutes = require("./routes/penilaian");
const myPenilaianRoutes = require("./routes/myPenilaian");
const panahanRoutes = require("./routes/panahan/panahan");
const logRoutes = require("./routes/log");

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
app.use("/jenis-penilaian", jenisPenilaianRoutes);
app.use("/penilaian", penilaianRoutes);
app.use("/penilaian-saya", myPenilaianRoutes);
app.use("/panahan", panahanRoutes);
app.use("/log", logRoutes);

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
