const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const db = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Trust proxy (untuk reverse proxy seperti nginx, cpanel, dll)
app.set("trust proxy", 1);

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
// Deteksi production: jika ada PORT dari environment (hosting) atau NODE_ENV=production
const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.PORT;
app.use(
  session({
    secret: "organisasi-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction, // true untuk HTTPS di production
      maxAge: 24 * 60 * 60 * 1000, // 24 jam
      httpOnly: true,
      sameSite: "lax",
    },
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
app
  .listen(PORT, HOST, () => {
    if (HOST === "0.0.0.0") {
      console.log(`Server running on all network interfaces`);
      console.log(`Access via: http://localhost:${PORT} (local)`);
      console.log(`Or use your machine's IP address: http://<your-ip>:${PORT}`);
    } else {
      console.log(`Server running on http://${HOST}:${PORT}`);
    }
    console.log(`Environment: ${isProduction ? "Production" : "Development"}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Please use a different port.`
      );
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });
