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

    // Tabel Activity Log (log semua aktivitas dan perubahan database)
    db.run(`CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      description TEXT,
      old_data TEXT,
      new_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create index for better query performance
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)`,
      () => {}
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id)`,
      () => {}
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_activity_log_table_name ON activity_log(table_name)`,
      () => {}
    );

    // Tabel Panahan Game (1 kali main dengan jumlah sesi dinamis)
    db.run(`CREATE TABLE IF NOT EXISTS panahan_game (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anggota_id INTEGER NOT NULL,
      tanggal DATE NOT NULL,
      jumlah_sesi INTEGER NOT NULL DEFAULT 2,
      total_score INTEGER DEFAULT 0,
      keterangan TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anggota_id) REFERENCES anggota(id) ON DELETE CASCADE
    )`);

    // Migration: Add jumlah_sesi column if not exists
    db.run(
      `ALTER TABLE panahan_game ADD COLUMN jumlah_sesi INTEGER NOT NULL DEFAULT 2`,
      () => {}
    );

    // Tabel Panahan Shoot (detail per shoot)
    // Menyimpan summary/total score per shoot
    db.run(`CREATE TABLE IF NOT EXISTS panahan_shoot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      shoot_number INTEGER NOT NULL CHECK(shoot_number BETWEEN 1 AND 6),
      total_score INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES panahan_game(id) ON DELETE CASCADE,
      UNIQUE(game_id, session_number, shoot_number)
    )`);

    // Tabel Panahan Shot (anak panah per game)
    // Struktur: 1 game = jumlah_sesi dinamis, 1 sesi = 6 shoot, 1 shoot = 6 anak panah
    db.run(`CREATE TABLE IF NOT EXISTS panahan_shot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL CHECK(session_number >= 1 AND session_number <= 10),
      shoot_number INTEGER,
      arrow_number INTEGER,
      group_number INTEGER,
      shot_number INTEGER,
      score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
      display_value TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES panahan_game(id) ON DELETE CASCADE
    )`);

    // Migration: Try to update constraint if table exists with old constraint
    // Note: SQLite doesn't support ALTER TABLE to modify CHECK constraints
    // This is a workaround - if the table exists, we'll handle it in application code
    // The constraint will be enforced for new tables

    // Migration: Add new columns if not exists
    db.run(
      `ALTER TABLE panahan_shot ADD COLUMN shoot_number INTEGER`,
      () => {}
    );
    db.run(
      `ALTER TABLE panahan_shot ADD COLUMN arrow_number INTEGER`,
      () => {}
    );

    // Copy data from old columns to new columns if new columns are NULL
    db.run(
      `UPDATE panahan_shot SET shoot_number = group_number WHERE shoot_number IS NULL AND group_number IS NOT NULL`,
      () => {}
    );
    db.run(
      `UPDATE panahan_shot SET arrow_number = shot_number WHERE arrow_number IS NULL AND shot_number IS NOT NULL`,
      () => {}
    );

    // Create unique constraint with new column names
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_panahan_shot_unique ON panahan_shot(game_id, session_number, COALESCE(shoot_number, group_number), COALESCE(arrow_number, shot_number))`,
      () => {}
    );

    // Migrate: Add display_value column if not exists
    db.run(
      `ALTER TABLE panahan_shot ADD COLUMN display_value TEXT DEFAULT NULL`,
      () => {}
    );

    // Create indexes for better query performance
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_panahan_game_anggota_id ON panahan_game(anggota_id)`,
      () => {}
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_panahan_game_tanggal ON panahan_game(tanggal DESC)`,
      () => {}
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_panahan_shot_game_id ON panahan_shot(game_id)`,
      () => {}
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_panahan_shoot_game_id ON panahan_shoot(game_id)`,
      () => {}
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_panahan_shoot_session ON panahan_shoot(game_id, session_number)`,
      () => {}
    );
  });
}

module.exports = db;
