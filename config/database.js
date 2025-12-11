const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname, "..", "database");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "organisasi.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database");
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Use serialize to ensure tables are created in order
  db.serialize(() => {
    // Tabel Organisasi (Data Badan Organisasi)
    db.run(`CREATE TABLE IF NOT EXISTS organisasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      alamat TEXT,
      telepon TEXT,
      email TEXT,
      logo TEXT,
      website TEXT,
      deskripsi TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migrate: Add columns if not exists (ignore errors if column exists)
    db.run(`ALTER TABLE organisasi ADD COLUMN logo TEXT`, () => {});
    db.run(`ALTER TABLE organisasi ADD COLUMN website TEXT`, () => {});
    db.run(`ALTER TABLE organisasi ADD COLUMN deskripsi TEXT`, () => {});

    // Tabel Users
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nama TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
      (err) => {
        if (err) {
          console.error("Error creating users table:", err);
        } else {
          // Insert default admin user after users table is created
          const bcrypt = require("bcryptjs");
          const defaultPassword = bcrypt.hashSync("admin123", 10);
          db.run(
            `INSERT OR IGNORE INTO users (username, password, nama, role) 
          VALUES ('admin', ?, 'Administrator', 'admin')`,
            [defaultPassword],
            (err) => {
              if (err) {
                console.error("Error creating default user:", err);
              } else {
                console.log(
                  "Default admin user created (username: admin, password: admin123)"
                );
              }
            }
          );
        }
      }
    );

    // Tabel Anggota
    db.run(`CREATE TABLE IF NOT EXISTS anggota (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      nik TEXT,
      alamat TEXT,
      telepon TEXT,
      email TEXT,
      tanggal_bergabung DATE,
      status TEXT DEFAULT 'aktif',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel Iuran Bulanan
    db.run(`CREATE TABLE IF NOT EXISTS iuran (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anggota_id INTEGER NOT NULL,
      bulan INTEGER NOT NULL,
      tahun INTEGER NOT NULL,
      jumlah INTEGER NOT NULL,
      frekuensi TEXT DEFAULT 'bulanan',
      tarif_id INTEGER,
      tanggal_bayar DATE,
      status TEXT DEFAULT 'lunas',
      keterangan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anggota_id) REFERENCES anggota(id),
      FOREIGN KEY (tarif_id) REFERENCES tarif(id)
    )`);

    // Migrasi kolom frekuensi dan tarif_id jika belum ada
    db.run(
      `ALTER TABLE iuran ADD COLUMN frekuensi TEXT DEFAULT 'bulanan'`,
      () => {}
    );
    db.run(`ALTER TABLE iuran ADD COLUMN tarif_id INTEGER`, () => {});

    // Tabel Buku Kas
    db.run(`CREATE TABLE IF NOT EXISTS buku_kas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal DATE NOT NULL,
      keterangan TEXT,
      kategori TEXT,
      debet INTEGER DEFAULT 0,
      kredit INTEGER DEFAULT 0,
      saldo INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel Tarif
    db.run(`CREATE TABLE IF NOT EXISTS tarif (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      jumlah INTEGER NOT NULL,
      frekuensi TEXT DEFAULT 'bulanan', -- bulanan | tahunan | seumur_hidup
      keterangan TEXT,
      status TEXT DEFAULT 'aktif',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migrasi kolom frekuensi jika belum ada
    db.run(
      `ALTER TABLE tarif ADD COLUMN frekuensi TEXT DEFAULT 'bulanan'`,
      () => {}
    );

    // Tabel Anggota Tarif (relasi anggota dengan tarif yang wajib dibayar)
    db.run(`CREATE TABLE IF NOT EXISTS anggota_tarif (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anggota_id INTEGER NOT NULL,
      tarif_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anggota_id) REFERENCES anggota(id) ON DELETE CASCADE,
      FOREIGN KEY (tarif_id) REFERENCES tarif(id) ON DELETE CASCADE,
      UNIQUE(anggota_id, tarif_id)
    )`);

    // Tabel Jenis Penilaian
    db.run(`CREATE TABLE IF NOT EXISTS jenis_penilaian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      deskripsi TEXT,
      bobot REAL DEFAULT 1.0,
      status TEXT DEFAULT 'aktif',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel Penilaian (penilaian bulanan anggota)
    db.run(`CREATE TABLE IF NOT EXISTS penilaian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anggota_id INTEGER NOT NULL,
      jenis_penilaian_id INTEGER NOT NULL,
      bulan INTEGER NOT NULL,
      tahun INTEGER NOT NULL,
      nilai REAL NOT NULL,
      keterangan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anggota_id) REFERENCES anggota(id) ON DELETE CASCADE,
      FOREIGN KEY (jenis_penilaian_id) REFERENCES jenis_penilaian(id) ON DELETE CASCADE,
      UNIQUE(anggota_id, jenis_penilaian_id, bulan, tahun)
    )`);
  });
}

module.exports = db;
