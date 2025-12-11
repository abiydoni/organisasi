const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

// Configure multer for file upload
const uploadDir = path.join(__dirname, "..", "temp");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.use(requireAuth);
router.use(requireAdmin); // Hanya admin yang bisa melihat log

router.get("/", (req, res) => {
  // Get organisasi data
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get activity logs with pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = req.query.search || "";

      let query = `
        SELECT 
          al.*,
          u.nama as user_nama
        FROM activity_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (search) {
        query += ` AND (
          al.description LIKE ? OR 
          al.action LIKE ? OR 
          al.table_name LIKE ? OR 
          al.username LIKE ? OR
          u.nama LIKE ?
        )`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      db.all(query, params, (err, logs) => {
        if (err) {
          console.error("Error fetching logs:", err);
          return res.status(500).send("Error fetching logs");
        }

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) as total FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
        const countParams = [];

        if (search) {
          countQuery += ` AND (
            al.description LIKE ? OR 
            al.action LIKE ? OR 
            al.table_name LIKE ? OR 
            al.username LIKE ? OR
            u.nama LIKE ?
          )`;
          const searchTerm = `%${search}%`;
          countParams.push(
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm
          );
        }

        db.get(countQuery, countParams, (err, countResult) => {
          if (err) {
            console.error("Error counting logs:", err);
            return res.status(500).send("Error counting logs");
          }

          const total = countResult?.total || 0;
          const totalPages = Math.ceil(total / limit);

          // Set active flags
          const userRole = req.session.user.role;
          const active = {
            log: true,
            isAdmin: userRole === "admin",
            isAdminOrPengurus: userRole === "admin" || userRole === "pengurus",
            isUser: userRole === "user",
            isTentor: userRole === "tentor",
          };

          const layout = renderHTML("log.html", {
            title: "Activity Log",
            user: req.session.user,
            active: active,
            content: "",
            organisasi: organisasi || {},
          });

          // Replace template variables
          const logsJson = JSON.stringify(logs || []);
          const paginationJson = JSON.stringify({
            page,
            limit,
            total,
            totalPages,
            search,
          });

          let html = layout.replace(/\{\{logs\}\}/g, logsJson);
          html = html.replace(/\{\{pagination\}\}/g, paginationJson);
          html = html.replace(
            /\{\{user\.nama\}\}/g,
            req.session.user.nama || ""
          );

          res.send(html);
        });
      });
    }
  );
});

// API endpoint untuk mendapatkan log (untuk AJAX)
router.get("/api", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";

  let query = `
    SELECT 
      al.*,
      u.nama as user_nama
    FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (
      al.description LIKE ? OR 
      al.action LIKE ? OR 
      al.table_name LIKE ? OR 
      al.username LIKE ? OR
      u.nama LIKE ?
    )`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  db.all(query, params, (err, logs) => {
    if (err) {
      return res.json({ success: false, message: "Error fetching logs" });
    }

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
    const countParams = [];

    if (search) {
      countQuery += ` AND (
        al.description LIKE ? OR 
        al.action LIKE ? OR 
        al.table_name LIKE ? OR 
        al.username LIKE ? OR
        u.nama LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      countParams.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    db.get(countQuery, countParams, (err, countResult) => {
      if (err) {
        return res.json({ success: false, message: "Error counting logs" });
      }

      const total = countResult?.total || 0;
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: logs || [],
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    });
  });
});

// Reset tables endpoint
router.post("/reset", requireAuth, requireAdmin, (req, res) => {
  const { tables, password } = req.body;

  // Validations
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    return res.json({
      success: false,
      message: "Pilih minimal satu tabel yang akan direset",
    });
  }

  if (!password) {
    return res.json({
      success: false,
      message: "Password admin wajib diisi",
    });
  }

  // Verify admin password
  const userId = req.session.user.id;
  db.get(
    "SELECT password FROM users WHERE id = ? AND role = 'admin'",
    [userId],
    (err, admin) => {
      if (err || !admin) {
        return res.json({
          success: false,
          message: "Anda tidak memiliki akses untuk melakukan reset",
        });
      }

      bcrypt.compare(password, admin.password, (err, match) => {
        if (err || !match) {
          return res.json({
            success: false,
            message: "Password admin salah",
          });
        }

        // Valid table names (security: prevent SQL injection)
        const validTables = [
          "activity_log",
          "organisasi",
          "users",
          "anggota",
          "iuran",
          "buku_kas",
          "tarif",
          "anggota_tarif",
          "jenis_penilaian",
          "penilaian",
        ];

        const tablesToReset = tables.filter((table) =>
          validTables.includes(table)
        );

        if (tablesToReset.length === 0) {
          return res.json({
            success: false,
            message: "Tidak ada tabel valid yang dipilih",
          });
        }

        // Reset tables
        let resetCount = 0;
        let errorCount = 0;
        const errors = [];

        db.serialize(() => {
          tablesToReset.forEach((tableName) => {
            if (tableName === "users") {
              // Special handling for users table: only delete non-admin users
              db.run("DELETE FROM users WHERE role != 'admin'", (err) => {
                if (err) {
                  errorCount++;
                  errors.push(`Error reset ${tableName}: ${err.message}`);
                  console.error(`Error resetting ${tableName}:`, err);
                } else {
                  resetCount++;
                  console.log(
                    `Table ${tableName} reset (non-admin users deleted)`
                  );
                }
              });
            } else {
              // Use DELETE for other tables (safer than TRUNCATE in SQLite)
              db.run(`DELETE FROM ${tableName}`, (err) => {
                if (err) {
                  errorCount++;
                  errors.push(`Error reset ${tableName}: ${err.message}`);
                  console.error(`Error resetting ${tableName}:`, err);
                } else {
                  // Reset auto-increment (SQLite specific)
                  db.run(
                    `DELETE FROM sqlite_sequence WHERE name = '${tableName}'`,
                    () => {}
                  );
                  resetCount++;
                  console.log(`Table ${tableName} reset successfully`);
                }
              });
            }
          });

          // Wait a bit for all operations to complete
          setTimeout(() => {
            if (errorCount > 0) {
              res.json({
                success: false,
                message: `${resetCount} tabel berhasil direset, ${errorCount} tabel gagal`,
                errors: errors,
              });
            } else {
              res.json({
                success: true,
                message: `${resetCount} tabel berhasil direset`,
              });
            }
          }, 500);
        });
      });
    }
  );
});

// Backup table endpoint
router.get("/backup/:tableName", requireAuth, requireAdmin, (req, res) => {
  const { tableName } = req.params;

  // Valid table names (security: prevent SQL injection)
  const validTables = [
    "activity_log",
    "organisasi",
    "users",
    "anggota",
    "iuran",
    "buku_kas",
    "tarif",
    "anggota_tarif",
    "jenis_penilaian",
    "penilaian",
  ];

  if (!validTables.includes(tableName)) {
    return res.status(400).json({
      success: false,
      message: "Nama tabel tidak valid",
    });
  }

  // Get all data from table
  db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      return res.status(500).json({
        success: false,
        message: "Error mengambil data dari tabel",
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tabel kosong, tidak ada data untuk di-backup",
      });
    }

    // Convert to CSV
    const headers = Object.keys(rows[0]);
    const csvRows = [];

    // Add headers
    csvRows.push(headers.join(","));

    // Add data rows
    rows.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (value === null || value === undefined) {
          return "";
        }
        const stringValue = String(value);
        if (
          stringValue.includes(",") ||
          stringValue.includes('"') ||
          stringValue.includes("\n")
        ) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(","));
    });

    const csvContent = csvRows.join("\n");

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${tableName}_backup_${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );

    // Add BOM for Excel compatibility
    res.write("\ufeff");
    res.write(csvContent);
    res.end();
  });
});

// Import table endpoint
router.post(
  "/import",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  (req, res) => {
    const { table } = req.body;
    const file = req.file;

    if (!table) {
      return res.json({
        success: false,
        message: "Nama tabel tidak ditentukan",
      });
    }

    if (!file) {
      return res.json({
        success: false,
        message: "File tidak ditemukan",
      });
    }

    // Valid table names
    const validTables = [
      "organisasi",
      "users",
      "anggota",
      "iuran",
      "buku_kas",
      "tarif",
      "anggota_tarif",
      "jenis_penilaian",
      "penilaian",
    ];

    if (!validTables.includes(table)) {
      // Clean up uploaded file
      if (file.path) {
        fs.unlinkSync(file.path);
      }
      return res.json({
        success: false,
        message: "Nama tabel tidak valid",
      });
    }

    // Read file
    const filePath = file.path;
    const fileExtension = path.extname(file.originalname).toLowerCase();

    try {
      let rows = [];
      const fileContent = fs.readFileSync(filePath, "utf-8");

      if (fileExtension === ".csv") {
        // Parse CSV
        const lines = fileContent.split("\n").filter((line) => line.trim());
        if (lines.length === 0) {
          throw new Error("File CSV kosong");
        }

        // Parse CSV (simple parser, handles quoted values)
        const parseCSVLine = (line) => {
          const result = [];
          let current = "";
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === "," && !inQuotes) {
              result.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseCSVLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || null;
            });
            rows.push(row);
          }
        }
      } else if (fileExtension === ".xlsx" || fileExtension === ".xls") {
        // For Excel files, we'll need a library
        // For now, return error suggesting to use CSV
        fs.unlinkSync(filePath);
        return res.json({
          success: false,
          message:
            "Format Excel belum didukung. Silakan konversi file ke CSV terlebih dahulu.",
        });
      } else {
        throw new Error("Format file tidak didukung. Gunakan CSV atau Excel.");
      }

      if (rows.length === 0) {
        fs.unlinkSync(filePath);
        return res.json({
          success: false,
          message: "Tidak ada data yang valid untuk diimport",
        });
      }

      // Get table structure to validate columns
      db.all(`PRAGMA table_info(${table})`, [], (err, columns) => {
        if (err) {
          fs.unlinkSync(filePath);
          return res.json({
            success: false,
            message: "Error mendapatkan struktur tabel",
          });
        }

        const validColumns = columns.map((col) => col.name);
        const csvColumns = Object.keys(rows[0]);

        // Check if all CSV columns exist in table
        const invalidColumns = csvColumns.filter(
          (col) => !validColumns.includes(col)
        );
        if (invalidColumns.length > 0) {
          fs.unlinkSync(filePath);
          return res.json({
            success: false,
            message: `Kolom tidak valid: ${invalidColumns.join(", ")}`,
          });
        }

        // Special handling for users table - don't import admin users
        if (table === "users") {
          rows = rows.filter((row) => row.role !== "admin");
        }

        // Insert data
        let successCount = 0;
        let errorCount = 0;
        let processedCount = 0;

        db.serialize(() => {
          rows.forEach((row, index) => {
            const columns = Object.keys(row).filter((col) =>
              validColumns.includes(col)
            );
            const placeholders = columns.map(() => "?").join(", ");
            const values = columns.map((col) => row[col] || null);

            db.run(
              `INSERT INTO ${table} (${columns.join(
                ", "
              )}) VALUES (${placeholders})`,
              values,
              (err) => {
                processedCount++;
                if (err) {
                  errorCount++;
                  console.error(`Error importing row ${index + 1}:`, err);
                } else {
                  successCount++;
                }

                // When all rows are processed
                if (processedCount === rows.length) {
                  // Clean up uploaded file
                  if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                  }

                  if (errorCount > 0) {
                    res.json({
                      success: false,
                      message: `${successCount} baris berhasil diimport, ${errorCount} baris gagal`,
                    });
                  } else {
                    res.json({
                      success: true,
                      message: `${successCount} baris berhasil diimport ke tabel ${table}`,
                    });
                  }
                }
              }
            );
          });
        });
      });
    } catch (error) {
      // Clean up uploaded file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      console.error("Error importing file:", error);
      res.json({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }
);

module.exports = router;
