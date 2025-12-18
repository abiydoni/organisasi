const express = require("express");
const router = express.Router();
const path = require("path");
const {
  requireAuth,
  requireAdminOrPengurusOrTentor,
} = require("../../middleware/auth");
const { renderHTML } = require("../../utils/render");
const db = require("../../config/database");
const { logInsert, logUpdate, logDelete } = require("../../utils/logger");

// Semua role yang sudah login bisa akses route ini
router.use(requireAuth);

// Route untuk halaman utama - list anggota
router.get("/", (req, res) => {
  const userRole = req.session.user.role;
  
  // Jika user adalah role "user", langsung redirect ke history scoring mereka
  if (userRole === "user") {
    // Cari anggota berdasarkan nama user
    db.get(
      "SELECT * FROM anggota WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1",
      [req.session.user.nama],
      (err, anggota) => {
        if (err) {
          console.error("Error fetching anggota:", err);
          return res.status(500).send("Error database: " + err.message);
        }

        if (!anggota) {
          return res.send(
            `<div style="padding: 20px; text-align: center;">
              <h1 style="color: #dc2626; margin-bottom: 10px;">Anggota Tidak Ditemukan</h1>
              <p style="color: #6b7280; margin-bottom: 20px;">
                Data anggota dengan nama "<strong>${req.session.user.nama}</strong>" tidak ditemukan dalam sistem.
              </p>
              <p style="color: #6b7280;">
                Silakan hubungi administrator untuk menghubungkan akun Anda dengan data anggota.
              </p>
              <a href="/auth/logout" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px;">
                Logout
              </a>
            </div>`
          );
        }

        // Redirect ke halaman history scoring untuk anggota ini
        return res.redirect(`/panahan/anggota/${anggota.id}`);
      }
    );
    return;
  }

  // Untuk admin, pengurus, dan tentor: tampilkan list anggota
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

          // Set active flags based on user role
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

          const layout = renderHTML("panahan/panahan.html", {
            title: "Scoring Panahan",
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

// Route untuk halaman detail anggota dengan history game
router.get("/anggota/:id", (req, res) => {
  const { id } = req.params;
  const userRole = req.session.user.role;

  // Validate ID
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).send("ID anggota tidak valid");
  }

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get anggota data
      db.get("SELECT * FROM anggota WHERE id=?", [id], (err, anggota) => {
        if (err) {
          console.error("Error fetching anggota:", err);
          return res.status(500).send("Error database: " + err.message);
        }

        if (!anggota) {
          return res.status(404).send("Anggota tidak ditemukan");
        }

        // Jika user adalah role "user", pastikan mereka hanya bisa akses data mereka sendiri
        if (userRole === "user") {
          const anggotaNama = (anggota.nama || "").trim().toLowerCase();
          const userNama = (req.session.user.nama || "").trim().toLowerCase();
          if (anggotaNama !== userNama) {
            return res.status(403).send("Akses ditolak. Anda hanya bisa melihat data scoring Anda sendiri.");
          }
        }

        // Get semua game untuk anggota ini
        db.all(
          `SELECT * FROM panahan_game 
          WHERE anggota_id = ? 
          ORDER BY tanggal DESC, created_at DESC`,
          [id],
          (err, games) => {
            if (err) {
              console.error("Error fetching games:", err);
              games = [];
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

            const layout = renderHTML("panahan/panahanAnggota.html", {
              title: `History Scoring - ${anggota.nama}`,
              user: req.session.user,
              active: active,
              content: "",
              organisasi: organisasi || {},
            });

            // Replace template variables
            // IMPORTANT: Replace specific properties BEFORE replacing the whole object
            const anggotaJson = JSON.stringify(anggota || {});
            const gamesJson = JSON.stringify(games || []);
            const organisasiJson = JSON.stringify(organisasi || {});
            let html = layout;
            
            // Replace specific properties first (before replacing whole object)
            const namaAnggota = (anggota && anggota.nama) ? String(anggota.nama) : "";
            // Replace all variations of the template variable
            while (html.includes("{{anggota.nama}}")) {
              html = html.replace("{{anggota.nama}}", namaAnggota);
            }
            // Also handle with spaces
            html = html.replace(/\{\{\s*anggota\.nama\s*\}\}/g, namaAnggota);
            
            const idAnggota = (anggota && anggota.id) ? String(anggota.id) : "";
            while (html.includes("{{anggota.id}}")) {
              html = html.replace("{{anggota.id}}", idAnggota);
            }
            html = html.replace(/\{\{\s*anggota\.id\s*\}\}/g, idAnggota);
            
            // Then replace the whole object
            html = html.replace(/\{\{anggota\}\}/g, anggotaJson);
            html = html.replace(/\{\{games\}\}/g, gamesJson);
            html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
            html = html.replace(
              /\{\{user\.nama\}\}/g,
              req.session.user.nama || ""
            );
            
            res.send(html);
          }
        );
      });
    }
  );
});

// Route untuk halaman create game baru (deprecated, sekarang via anggota detail)
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

          const layout = renderHTML("panahan/panahanCreate.html", {
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

// Route untuk halaman game - tabel sesi dengan total
router.get("/game/:id", (req, res) => {
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

          const jumlahSesi = game.jumlah_sesi || 2;

          // Get total score per sesi
          db.all(
            `SELECT 
              session_number,
              SUM(score) as total_score
            FROM panahan_shot 
            WHERE game_id = ? 
            GROUP BY session_number
            ORDER BY session_number`,
            [id],
            (err, sessionTotals) => {
              if (err) {
                console.error("Error fetching session totals:", err);
                sessionTotals = [];
              }

              // Create map for easy lookup
              const sessionMap = {};
              sessionTotals.forEach((s) => {
                sessionMap[s.session_number] = s.total_score || 0;
              });

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

              const layout = renderHTML("panahan/panahanGame.html", {
                title: `Permainan - ${game.nama_anggota}`,
                user: req.session.user,
                active: active,
                content: "",
                organisasi: organisasi || {},
              });

              // Replace template variables
              const gameJson = JSON.stringify(game || {});
              const sessionTotalsJson = JSON.stringify(sessionTotals || []);
              const organisasiJson = JSON.stringify(organisasi || {});
              let html = layout.replace(/\{\{game\}\}/g, gameJson);
              html = html.replace(/\{\{game\.id\}\}/g, game?.id || "");
              html = html.replace(/\{\{game\.nama_anggota\}\}/g, game?.nama_anggota || "");
              html = html.replace(/\{\{game\.anggota_id\}\}/g, game?.anggota_id || "");
              html = html.replace(/\{\{sessionTotals\}\}/g, sessionTotalsJson);
              html = html.replace(/\{\{jumlahSesi\}\}/g, jumlahSesi);
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
  const { anggota_id, tanggal, jumlah_sesi, keterangan } = req.body;
  const userRole = req.session.user.role;

  if (!anggota_id || !tanggal || !jumlah_sesi) {
    return res.json({
      success: false,
      message: "Anggota, tanggal, dan jumlah sesi wajib diisi",
    });
  }

  // Jika user adalah role "user", pastikan mereka hanya bisa membuat game untuk diri mereka sendiri
  if (userRole === "user") {
    db.get("SELECT * FROM anggota WHERE id=?", [anggota_id], (err, anggota) => {
      if (err || !anggota) {
        return res.json({
          success: false,
          message: "Anggota tidak ditemukan",
        });
      }

      const anggotaNama = (anggota.nama || "").trim().toLowerCase();
      const userNama = (req.session.user.nama || "").trim().toLowerCase();
      if (anggotaNama !== userNama) {
        return res.json({
          success: false,
          message: "Akses ditolak. Anda hanya bisa membuat game untuk diri Anda sendiri.",
        });
      }

      // Lanjutkan dengan proses create
      createGame();
    });
    return;
  }

  // Untuk admin, pengurus, dan tentor: langsung create
  createGame();

  function createGame() {
    const sesiCount = parseInt(jumlah_sesi) || 2;
    if (sesiCount < 1 || sesiCount > 10) {
      return res.json({
        success: false,
        message: "Jumlah sesi harus antara 1-10",
      });
    }

  // Insert game baru
  db.run(
    "INSERT INTO panahan_game (anggota_id, tanggal, jumlah_sesi, keterangan) VALUES (?, ?, ?, ?)",
    [anggota_id, tanggal, sesiCount, keterangan || ""],
    function (err) {
      if (err) {
        return res.json({
          success: false,
          message: "Error simpan data: " + err.message,
        });
      }

      const gameId = this.lastID;

      // Buat anak panah kosong (jumlah_sesi x 6 shoot x 6 anak panah)
      const shots = [];
      for (let session = 1; session <= sesiCount; session++) {
        for (let shoot = 1; shoot <= 6; shoot++) {
          for (let arrow = 1; arrow <= 6; arrow++) {
            shots.push([gameId, session, shoot, arrow, 0, '0']);
          }
        }
      }

      // Insert semua shots sekaligus dan buat record di panahan_shoot
      db.serialize(() => {
        const stmt = db.prepare(
          "INSERT INTO panahan_shot (game_id, session_number, shoot_number, arrow_number, score, display_value) VALUES (?, ?, ?, ?, ?, ?)"
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

          // Buat record di panahan_shoot untuk setiap shoot (total_score = 0)
          const shootStmt = db.prepare(
            "INSERT INTO panahan_shoot (game_id, session_number, shoot_number, total_score) VALUES (?, ?, ?, 0)"
          );

          for (let session = 1; session <= sesiCount; session++) {
            for (let shoot = 1; shoot <= 6; shoot++) {
              shootStmt.run([gameId, session, shoot]);
            }
          }

          shootStmt.finalize((err) => {
            if (err) {
              console.error("Error inserting shoots:", err);
              // Tidak return error, karena shots sudah berhasil
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
      });
    }
  );
  }
});

// Route untuk halaman sesi - tabel shoot dengan 6 kolom nilai + total
router.get("/game/:id/sesi/:session_number", (req, res) => {
  const { id, session_number } = req.params;
  const sessionNum = parseInt(session_number);

  // Validate
  if (!id || isNaN(parseInt(id)) || !session_number || isNaN(sessionNum)) {
    return res.status(400).send("ID game atau nomor sesi tidak valid");
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
          if (err || !game) {
            return res.status(404).send("Game tidak ditemukan");
          }

          // Get semua shoots untuk sesi ini dengan total per shoot
          db.all(
            `SELECT 
              shoot_number,
              SUM(score) as total_score
            FROM panahan_shot 
            WHERE game_id = ? AND session_number = ?
            GROUP BY shoot_number
            ORDER BY shoot_number`,
            [id, sessionNum],
            (err, shootTotals) => {
              if (err) {
                console.error("Error fetching shoot totals:", err);
                shootTotals = [];
              }

              // Get detail per arrow untuk setiap shoot
              db.all(
                `SELECT 
                  shoot_number,
                  arrow_number,
                  score,
                  display_value
                FROM panahan_shot 
                WHERE game_id = ? AND session_number = ?
                ORDER BY shoot_number, arrow_number`,
                [id, sessionNum],
                (err, arrows) => {
                  if (err) {
                    console.error("Error fetching arrows:", err);
                    arrows = [];
                  }

                  // Organize arrows by shoot
                  const shootData = {};
                  arrows.forEach((arrow) => {
                    if (!shootData[arrow.shoot_number]) {
                      shootData[arrow.shoot_number] = [];
                    }
                    shootData[arrow.shoot_number].push(arrow);
                  });

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

                  const layout = renderHTML("panahan/panahanSesi.html", {
                    title: `Sesi ${sessionNum} - ${game.nama_anggota}`,
                    user: req.session.user,
                    active: active,
                    content: "",
                    organisasi: organisasi || {},
                  });

                  // Replace template variables
                  const gameJson = JSON.stringify(game || {});
                  const shootTotalsJson = JSON.stringify(shootTotals || []);
                  const shootDataJson = JSON.stringify(shootData || {});
                  const organisasiJson = JSON.stringify(organisasi || {});
                  let html = layout.replace(/\{\{game\}\}/g, gameJson);
                  html = html.replace(/\{\{game\.id\}\}/g, game?.id || "");
                  html = html.replace(/\{\{game\.nama_anggota\}\}/g, game?.nama_anggota || "");
                  html = html.replace(/\{\{game\.anggota_id\}\}/g, game?.anggota_id || "");
                  html = html.replace(/\{\{sessionNumber\}\}/g, sessionNum);
                  html = html.replace(/\{\{shootTotals\}\}/g, shootTotalsJson);
                  html = html.replace(/\{\{shootData\}\}/g, shootDataJson);
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
    }
  );
});

// Route untuk halaman shoot - form scoring
router.get("/game/:id/sesi/:session_number/shoot/:shoot_number", (req, res) => {
  const { id, session_number, shoot_number } = req.params;
  const sessionNum = parseInt(session_number);
  const shootNum = parseInt(shoot_number);

  // Validate
  if (!id || isNaN(parseInt(id)) || !session_number || isNaN(sessionNum) || !shoot_number || isNaN(shootNum)) {
    return res.status(400).send("Parameter tidak valid");
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
          if (err || !game) {
            return res.status(404).send("Game tidak ditemukan");
          }

          // Get semua arrows untuk shoot ini
          db.all(
            `SELECT * FROM panahan_shot 
            WHERE game_id = ? AND session_number = ? AND shoot_number = ?
            ORDER BY arrow_number`,
            [id, sessionNum, shootNum],
            (err, arrows) => {
              if (err) {
                console.error("Error fetching arrows:", err);
                arrows = [];
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

              const layout = renderHTML("panahan/panahanShoot.html", {
                title: `Shoot ${shootNum} - Sesi ${sessionNum}`,
                user: req.session.user,
                active: active,
                content: "",
                organisasi: organisasi || {},
              });

              // Replace template variables
              const gameJson = JSON.stringify(game || {});
              const arrowsJson = JSON.stringify(arrows || []);
              const organisasiJson = JSON.stringify(organisasi || {});
              let html = layout.replace(/\{\{game\}\}/g, gameJson);
              html = html.replace(/\{\{game\.id\}\}/g, game?.id || "");
              html = html.replace(/\{\{game\.nama_anggota\}\}/g, game?.nama_anggota || "");
              html = html.replace(/\{\{game\.anggota_id\}\}/g, game?.anggota_id || "");
              html = html.replace(/\{\{sessionNumber\}\}/g, sessionNum);
              html = html.replace(/\{\{shootNumber\}\}/g, shootNum);
              html = html.replace(/\{\{arrows\}\}/g, arrowsJson);
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

// Route untuk update shots (save scoring)
router.post("/game/:id/shoot", (req, res) => {
  const { id } = req.params;
  const { session_number, shoot_number, arrows } = req.body; // arrows: [{arrow_number, score, display_value}]

  console.log("Received save request:", { id, session_number, shoot_number, arrowsCount: arrows?.length, arrows });

  if (!session_number || !shoot_number || !arrows || !Array.isArray(arrows)) {
    console.error("Invalid data:", { session_number, shoot_number, arrows });
    return res.json({
      success: false,
      message: "Data tidak valid",
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

    // Update atau insert arrows
    db.serialize(() => {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO panahan_shot 
        (game_id, session_number, shoot_number, arrow_number, score, display_value, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      );

      let updateCount = 0;
      let errorCount = 0;
      
      arrows.forEach((arrow) => {
        const { arrow_number, score, display_value } = arrow;
        
        // Validate score range
        if (score < 0 || score > 10) {
          errorCount++;
          return;
        }

        // Set display_value default jika tidak ada
        const displayValue = display_value || (score === 10 ? '10' : score.toString());

        stmt.run([id, session_number, shoot_number, arrow_number, score, displayValue], (err) => {
          if (err) {
            console.error(`Error inserting arrow ${arrow_number}:`, err);
            errorCount++;
          } else {
            updateCount++;
          }
        });
      });

      stmt.finalize((err) => {
        if (err) {
          console.error("Error finalizing statement:", err);
          return res.json({
            success: false,
            message: "Error update arrows: " + err.message,
          });
        }
        
        if (errorCount > 0) {
          console.warn(`${errorCount} arrows failed to save`);
        }

        // Calculate total score for this shoot
        db.get(
          "SELECT SUM(score) as total FROM panahan_shot WHERE game_id = ? AND session_number = ? AND shoot_number = ?",
          [id, session_number, shoot_number],
          (err, result) => {
            const shootTotal = result?.total || 0;

            // Insert or update panahan_shoot table
            db.run(
              `INSERT OR REPLACE INTO panahan_shoot 
              (game_id, session_number, shoot_number, total_score, updated_at) 
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [id, session_number, shoot_number, shootTotal],
              (err) => {
                if (err) {
                  console.error("Error saving panahan_shoot:", err);
                }

                // Calculate total score for session
                db.get(
                  "SELECT SUM(score) as total FROM panahan_shot WHERE game_id = ? AND session_number = ?",
                  [id, session_number],
                  (err, sessionResult) => {
                    const sessionTotal = sessionResult?.total || 0;

                    // Calculate total score for game
                    db.get(
                      "SELECT SUM(score) as total FROM panahan_shot WHERE game_id = ?",
                      [id],
                      (err, gameResult) => {
                        const gameTotal = gameResult?.total || 0;

                        // Update total score di game
                        db.run(
                          "UPDATE panahan_game SET total_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                          [gameTotal, id],
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
                                  `Mengupdate scoring shoot ${shoot_number} sesi ${session_number} untuk anggota: ${namaAnggota} (Game ID: ${id}, Shoot Total: ${shootTotal})`,
                                  null,
                                  { session_number, shoot_number, arrows, shootTotal }
                                );
                              }
                            );

                            res.json({
                              success: true,
                              message: "Scoring berhasil disimpan",
                              shootTotal: shootTotal,
                              sessionTotal: sessionTotal,
                              gameTotal: gameTotal,
                            });
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});

// Route untuk update shots (save scoring) - backward compatibility
router.post("/:id/shots", (req, res) => {
  const { id } = req.params;
  const { shots } = req.body; // Array of {session_number, shoot_number, arrow_number, score, display_value}

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
      (game_id, session_number, shoot_number, arrow_number, score, display_value, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );

    let updateCount = 0;
    shots.forEach((shot) => {
      // Support both old and new field names for backward compatibility
      const session_number = shot.session_number;
      const shoot_number = shot.shoot_number || shot.group_number;
      const arrow_number = shot.arrow_number || shot.shot_number;
      const score = shot.score;
      const display_value = shot.display_value;
      
      // Validate score range
      if (score < 0 || score > 10) {
        return;
      }

      // Set display_value default jika tidak ada
      const displayValue = display_value || (score === 10 ? '10' : score.toString());

      stmt.run([id, session_number, shoot_number, arrow_number, score, displayValue], (err) => {
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
    ORDER BY session_number, shoot_number, arrow_number`,
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

