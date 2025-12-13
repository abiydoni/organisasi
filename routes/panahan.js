const express = require("express");
const router = express.Router();
const path = require("path");
const {
  requireAuth,
  requireAdminOrPengurusOrTentor,
} = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");
const { logInsert, logUpdate, logDelete } = require("../utils/logger");

// Admin, pengurus, dan tentor bisa akses route ini
router.use(requireAuth);
router.use(requireAdminOrPengurusOrTentor);

// Route untuk halaman utama - list semua game
router.get("/", (req, res) => {
  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get semua game dengan data anggota
      db.all(
        `SELECT 
          pg.*,
          a.nama as nama_anggota
        FROM panahan_game pg
        INNER JOIN anggota a ON pg.anggota_id = a.id
        ORDER BY pg.tanggal DESC, pg.created_at DESC`,
        [],
        (err, games) => {
          if (err) {
            console.error("Database error:", err);
            games = [];
          }

          // Set active flags based on user role
          const userRole = req.session.user.role;
          const active = {
            panahan: true,
            isAdmin: userRole === "admin",
            isAdminOrPengurus: userRole === "admin" || userRole === "pengurus",
            isUser: userRole === "user",
            isTentor: userRole === "tentor",
            isAdminOrPengurusOrTentor:
              userRole === "admin" ||
              userRole === "pengurus" ||
              userRole === "tentor",
          };

          const layout = renderHTML("panahan.html", {
            title: "Scoring Panahan",
            user: req.session.user,
            active: active,
            content: "",
            organisasi: organisasi || {},
          });

          // Replace template variables
          const gamesJson = JSON.stringify(games || []);
          const organisasiJson = JSON.stringify(organisasi || {});
          let html = layout.replace(/\{\{games\}\}/g, gamesJson);
          html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
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

// Route untuk halaman create game baru
router.get("/create", (req, res) => {
  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get semua anggota aktif
      db.all(
        "SELECT * FROM anggota WHERE status='aktif' ORDER BY nama",
        [],
        (err, anggota) => {
          if (err) {
            console.error("Database error:", err);
            anggota = [];
          }

          // Set active flags
          const userRole = req.session.user.role;
          const active = {
            panahan: true,
            isAdmin: userRole === "admin",
            isAdminOrPengurus: userRole === "admin" || userRole === "pengurus",
            isUser: userRole === "user",
            isTentor: userRole === "tentor",
            isAdminOrPengurusOrTentor:
              userRole === "admin" ||
              userRole === "pengurus" ||
              userRole === "tentor",
          };

          const layout = renderHTML("panahanCreate.html", {
            title: "Buat Game Panahan Baru",
            user: req.session.user,
            active: active,
            content: "",
            organisasi: organisasi || {},
          });

          // Replace template variables
          const anggotaJson = JSON.stringify(anggota || []);
          const organisasiJson = JSON.stringify(organisasi || {});
          let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
          html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
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

// Route untuk halaman detail game dengan scoring
router.get("/:id", (req, res) => {
  const { id } = req.params;

  // Validate ID
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).send("ID game tidak valid");
  }

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get game data
      db.get(
        `SELECT 
          pg.*,
          a.nama as nama_anggota
        FROM panahan_game pg
        INNER JOIN anggota a ON pg.anggota_id = a.id
        WHERE pg.id = ?`,
        [id],
        (err, game) => {
          if (err) {
            console.error("Error fetching game:", err);
            return res.status(500).send("Error database: " + err.message);
          }

          if (!game) {
            return res.status(404).send("Game tidak ditemukan");
          }

          // Get semua shots untuk game ini
          db.all(
            `SELECT * FROM panahan_shot 
            WHERE game_id = ? 
            ORDER BY session_number, group_number, shot_number`,
            [id],
            (err, shots) => {
              if (err) {
                console.error("Error fetching shots:", err);
                shots = [];
              }

              // Set active flags
              const userRole = req.session.user.role;
              const active = {
                panahan: true,
                isAdmin: userRole === "admin",
                isAdminOrPengurus:
                  userRole === "admin" || userRole === "pengurus",
                isUser: userRole === "user",
                isTentor: userRole === "tentor",
                isAdminOrPengurusOrTentor:
                  userRole === "admin" ||
                  userRole === "pengurus" ||
                  userRole === "tentor",
              };

              const layout = renderHTML("panahanDetail.html", {
                title: `Scoring Panahan - ${game.nama_anggota}`,
                user: req.session.user,
                active: active,
                content: "",
                organisasi: organisasi || {},
              });

              // Replace template variables
              const gameJson = JSON.stringify(game || {});
              const shotsJson = JSON.stringify(shots || []);
              const organisasiJson = JSON.stringify(organisasi || {});
              let html = layout.replace(/\{\{game\}\}/g, gameJson);
              html = html.replace(/\{\{shots\}\}/g, shotsJson);
              html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
              html = html.replace(
                /\{\{user\.nama\}\}/g,
                req.session.user.nama || ""
              );
              res.send(html);
            }
          );
        }
      );
    }
  );
});

// Route untuk create game baru
router.post("/create", (req, res) => {
  const { anggota_id, tanggal, keterangan } = req.body;

  if (!anggota_id || !tanggal) {
    return res.json({
      success: false,
      message: "Anggota dan tanggal wajib diisi",
    });
  }

  // Insert game baru
  db.run(
    "INSERT INTO panahan_game (anggota_id, tanggal, keterangan) VALUES (?, ?, ?)",
    [anggota_id, tanggal, keterangan || ""],
    function (err) {
      if (err) {
        return res.json({
          success: false,
          message: "Error simpan data: " + err.message,
        });
      }

      const gameId = this.lastID;

      // Buat 72 tembakan kosong (2 sesi x 6 group x 6 tembakan)
      const shots = [];
      for (let session = 1; session <= 2; session++) {
        for (let group = 1; group <= 6; group++) {
          for (let shot = 1; shot <= 6; shot++) {
            shots.push([gameId, session, group, shot, 0, '0']);
          }
        }
      }

      // Insert semua shots sekaligus
      db.serialize(() => {
        const stmt = db.prepare(
          "INSERT INTO panahan_shot (game_id, session_number, group_number, shot_number, score, display_value) VALUES (?, ?, ?, ?, ?, ?)"
        );

        shots.forEach((shot) => {
          stmt.run(shot);
        });

        stmt.finalize((err) => {
          if (err) {
            console.error("Error inserting shots:", err);
            return res.json({
              success: false,
              message: "Error membuat tembakan: " + err.message,
            });
          }

          // Log insert
          db.get("SELECT nama FROM anggota WHERE id=?", [anggota_id], (err, anggota) => {
            const namaAnggota = anggota?.nama || "Unknown";
            logInsert(
              req,
              "panahan_game",
              gameId,
              `Membuat game panahan baru untuk anggota: ${namaAnggota} (Tanggal: ${tanggal})`,
              {
                anggota_id,
                tanggal,
                keterangan,
              }
            );
          });

          res.json({
            success: true,
            message: "Game berhasil dibuat",
            gameId: gameId,
          });
        });
      });
    }
  );
});

// Route untuk update shots (save scoring)
router.post("/:id/shots", (req, res) => {
  const { id } = req.params;
  const { shots } = req.body; // Array of {session_number, group_number, shot_number, score}

  if (!shots || !Array.isArray(shots)) {
    return res.json({
      success: false,
      message: "Data shots tidak valid",
    });
  }

  // Validate game exists
  db.get("SELECT * FROM panahan_game WHERE id=?", [id], (err, game) => {
    if (err || !game) {
      return res.json({
        success: false,
        message: "Game tidak ditemukan",
      });
    }

    // Update atau insert shots
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO panahan_shot 
      (game_id, session_number, group_number, shot_number, score, display_value, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );

    let updateCount = 0;
    shots.forEach((shot) => {
      const { session_number, group_number, shot_number, score, display_value } = shot;
      
      // Validate score range
      if (score < 0 || score > 10) {
        return;
      }

      // Set display_value default jika tidak ada
      const displayValue = display_value || (score === 10 ? '10' : score.toString());

      stmt.run([id, session_number, group_number, shot_number, score, displayValue], (err) => {
        if (!err) updateCount++;
      });
    });

    stmt.finalize((err) => {
      if (err) {
        return res.json({
          success: false,
          message: "Error update shots: " + err.message,
        });
      }

      // Calculate total score
      db.all(
        "SELECT SUM(score) as total FROM panahan_shot WHERE game_id = ?",
        [id],
        (err, result) => {
          const totalScore = result[0]?.total || 0;

          // Update total score di game
          db.run(
            "UPDATE panahan_game SET total_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [totalScore, id],
            (err) => {
              if (err) {
                console.error("Error updating total score:", err);
              }

              // Log update
              db.get(
                "SELECT nama FROM anggota WHERE id=?",
                [game.anggota_id],
                (err, anggota) => {
                  const namaAnggota = anggota?.nama || "Unknown";
                  logUpdate(
                    req,
                    "panahan_shot",
                    id,
                    `Mengupdate scoring panahan untuk anggota: ${namaAnggota} (Game ID: ${id}, Total: ${totalScore})`,
                    null,
                    { shots, totalScore }
                  );
                }
              );

              res.json({
                success: true,
                message: "Scoring berhasil disimpan",
                totalScore: totalScore,
              });
            }
          );
        }
      );
    });
  });
});

// Route untuk get shots
router.get("/:id/shots", (req, res) => {
  const { id } = req.params;

  db.all(
    `SELECT * FROM panahan_shot 
    WHERE game_id = ? 
    ORDER BY session_number, group_number, shot_number`,
    [id],
    (err, shots) => {
      if (err) {
        return res.json({ success: false, message: "Error database" });
      }
      res.json({ success: true, data: shots || [] });
    }
  );
});

// Route untuk delete game
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  // Get old data for logging
  db.get(
    `SELECT pg.*, a.nama as nama_anggota 
    FROM panahan_game pg
    INNER JOIN anggota a ON pg.anggota_id = a.id
    WHERE pg.id = ?`,
    [id],
    (err, game) => {
      if (err || !game) {
        return res.json({ success: false, message: "Game tidak ditemukan" });
      }

      // Delete game (shots will be deleted automatically due to CASCADE)
      db.run("DELETE FROM panahan_game WHERE id=?", [id], (err) => {
        if (err) {
          return res.json({ success: false, message: "Error hapus data" });
        }

        // Log delete
        logDelete(
          req,
          "panahan_game",
          id,
          `Menghapus game panahan untuk anggota: ${game.nama_anggota} (Tanggal: ${game.tanggal}, Total Score: ${game.total_score})`,
          game
        );

        res.json({ success: true, message: "Game berhasil dihapus" });
      });
    }
  );
});

module.exports = router;

