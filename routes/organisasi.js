const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const { requireAuth } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

// Configure multer for file upload
const uploadsDir = path.join(__dirname, "..", "public", "uploads", "logos");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Hanya file gambar yang diizinkan (PNG, JPG, GIF, WEBP)"));
    }
  },
});

router.get("/", (req, res) => {
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      const layout = renderHTML("organisasi.html", {
        title: "Data Organisasi",
        user: req.session.user,
        active: { organisasi: true },
        content: "",
        organisasi: organisasi || {},
      });
      // Replace template variables
      // Note: organisasi sudah di-inject di renderHTML, jadi tidak perlu replace lagi
      // const organisasiJson = JSON.stringify(organisasi || {});
      // let html = layout.replace(/\{\{organisasi\}\}/g, organisasiJson);

      // Replace user data
      let html = layout.replace(
        /\{\{user\.nama\}\}/g,
        req.session.user.nama || ""
      );

      res.send(html);
    }
  );
});

router.get("/data", (req, res) => {
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      res.json(organisasi || {});
    }
  );
});

// Upload logo endpoint
router.post("/upload-logo", (req, res) => {
  upload.single("logo")(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.json({
            success: false,
            message: "Ukuran file terlalu besar. Maksimal 2MB",
          });
        }
      }
      return res.json({
        success: false,
        message: err.message || "Error saat upload file",
      });
    }

    if (!req.file) {
      return res.json({
        success: false,
        message: "Tidak ada file yang diupload",
      });
    }

    try {
      // Resize dan optimize gambar
      const originalPath = req.file.path;
      const ext = path.extname(req.file.filename).toLowerCase();

      // Buat temporary file untuk output
      const tempPath = originalPath + ".tmp";

      // Resize ke maksimal 200x200px dengan maintain aspect ratio
      let sharpInstance = sharp(originalPath).resize(200, 200, {
        fit: "inside",
        withoutEnlargement: true,
      });

      // Optimize berdasarkan format - tulis ke temp file dulu
      if (ext === ".png") {
        await sharpInstance
          .png({ quality: 80, compressionLevel: 9 })
          .toFile(tempPath);
      } else if (ext === ".jpg" || ext === ".jpeg") {
        await sharpInstance
          .jpeg({ quality: 80, mozjpeg: true })
          .toFile(tempPath);
      } else if (ext === ".webp") {
        await sharpInstance.webp({ quality: 80 }).toFile(tempPath);
      } else {
        // Untuk format lain, convert ke JPEG
        const jpegFilename = req.file.filename.replace(ext, ".jpg");
        const jpegPath = path.join(uploadsDir, jpegFilename);
        await sharpInstance
          .jpeg({ quality: 80, mozjpeg: true })
          .toFile(jpegPath);
        // Hapus file original
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
        req.file.filename = jpegFilename;
        req.file.path = jpegPath;

        const logoPath = `/uploads/logos/${req.file.filename}`;
        return res.json({
          success: true,
          message: "Logo berhasil diupload dan dioptimasi (maksimal 200x200px)",
          logoPath: logoPath,
        });
      }

      // Replace original file dengan temp file
      if (fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }
      fs.renameSync(tempPath, originalPath);

      const logoPath = `/uploads/logos/${req.file.filename}`;
      res.json({
        success: true,
        message: "Logo berhasil diupload dan dioptimasi (maksimal 200x200px)",
        logoPath: logoPath,
      });
    } catch (error) {
      console.error("Error processing image:", error);
      // Jika error, tetap return path original
      const logoPath = `/uploads/logos/${req.file.filename}`;
      res.json({
        success: true,
        message: "Logo berhasil diupload",
        logoPath: logoPath,
      });
    }
  });
});

router.post("/save", (req, res) => {
  const { nama, alamat, telepon, email, logo, website, deskripsi } = req.body;

  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, existing) => {
      if (existing) {
        // Delete old logo if new one is provided and old one exists
        if (
          logo &&
          existing.logo &&
          existing.logo.startsWith("/uploads/logos/")
        ) {
          const oldLogoPath = path.join(
            __dirname,
            "..",
            "public",
            existing.logo
          );
          if (fs.existsSync(oldLogoPath)) {
            fs.unlinkSync(oldLogoPath);
          }
        }

        db.run(
          `UPDATE organisasi SET nama=?, alamat=?, telepon=?, email=?, logo=?, website=?, deskripsi=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [nama, alamat, telepon, email, logo, website, deskripsi, existing.id],
          (err) => {
            if (err) {
              return res.json({ success: false, message: "Error update data" });
            }
            res.json({
              success: true,
              message: "Data organisasi berhasil diupdate",
            });
          }
        );
      } else {
        db.run(
          `INSERT INTO organisasi (nama, alamat, telepon, email, logo, website, deskripsi) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [nama, alamat, telepon, email, logo, website, deskripsi],
          (err) => {
            if (err) {
              return res.json({ success: false, message: "Error simpan data" });
            }
            res.json({
              success: true,
              message: "Data organisasi berhasil disimpan",
            });
          }
        );
      }
    }
  );
});

module.exports = router;
