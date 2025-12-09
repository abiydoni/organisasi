const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth, requireAdminOrPengurus } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);
// Hanya admin dan pengurus yang bisa akses
router.use(requireAdminOrPengurus);

router.get("/", (req, res) => {
  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      db.all("SELECT * FROM anggota ORDER BY id DESC", [], (err, anggota) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).send("Database error");
        }

        // Get all tarif aktif
        db.all(
          'SELECT * FROM tarif WHERE status = "aktif" ORDER BY id DESC',
          [],
          (err, tarif) => {
            if (err) {
              console.error("Database error:", err);
              tarif = [];
            }

            // Set active flags based on user role
            const userRole = req.session.user.role;
            const active = {
              anggota: true,
              isAdmin: userRole === "admin",
              isAdminOrPengurus:
                userRole === "admin" || userRole === "pengurus",
              isUser: userRole === "user",
            };

            const layout = renderHTML("anggota.html", {
              title: "Data Anggota",
              user: req.session.user,
              active: active,
              content: "",
              organisasi: organisasi || {},
            });

            // Replace template variables
            const anggotaJson = JSON.stringify(anggota || []);
            const tarifJson = JSON.stringify(tarif || []);
            const organisasiJson = JSON.stringify(organisasi || {});
            let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
            html = html.replace(/\{\{tarif\}\}/g, tarifJson);
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

router.get("/data", (req, res) => {
  db.all("SELECT * FROM anggota ORDER BY id DESC", [], (err, anggota) => {
    res.json(anggota || []);
  });
});

router.post("/create", (req, res) => {
  const {
    nama,
    nik,
    alamat,
    telepon,
    email,
    tanggal_bergabung,
    status,
    tarif_ids,
  } = req.body;

  db.run(
    "INSERT INTO anggota (nama, nik, alamat, telepon, email, tanggal_bergabung, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [nama, nik, alamat, telepon, email, tanggal_bergabung, status || "aktif"],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "Error simpan data" });
      }

      const anggotaId = this.lastID;

      // Jika ada tarif_ids yang dipilih, simpan ke anggota_tarif
      if (tarif_ids && Array.isArray(tarif_ids) && tarif_ids.length > 0) {
        const validTarifIds = tarif_ids
          .map((tid) => parseInt(tid))
          .filter((tid) => !isNaN(tid));

        if (validTarifIds.length > 0) {
          const placeholders = validTarifIds.map(() => "(?, ?)").join(", ");
          const values = validTarifIds.flatMap((tid) => [anggotaId, tid]);

          db.run(
            `INSERT INTO anggota_tarif (anggota_id, tarif_id) VALUES ${placeholders}`,
            values,
            (err) => {
              if (err) {
                console.error("Error inserting tarif:", err);
                // Tetap return success karena anggota sudah dibuat
              }
            }
          );
        }
      }

      res.json({ success: true, message: "Anggota berhasil ditambahkan" });
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const {
    nama,
    nik,
    alamat,
    telepon,
    email,
    tanggal_bergabung,
    status,
    tarif_ids,
  } = req.body;

  db.serialize(() => {
    // Update data anggota
    db.run(
      "UPDATE anggota SET nama=?, nik=?, alamat=?, telepon=?, email=?, tanggal_bergabung=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [nama, nik, alamat, telepon, email, tanggal_bergabung, status, id],
      (err) => {
        if (err) {
          return res.json({ success: false, message: "Error update data" });
        }

        // Update tarif anggota
        db.run("DELETE FROM anggota_tarif WHERE anggota_id=?", [id], (err) => {
          if (err) {
            console.error("Error deleting existing tarif:", err);
          }

          // Jika ada tarif_ids yang dipilih, insert semuanya
          if (tarif_ids && Array.isArray(tarif_ids) && tarif_ids.length > 0) {
            const validTarifIds = tarif_ids
              .map((tid) => parseInt(tid))
              .filter((tid) => !isNaN(tid));

            if (validTarifIds.length > 0) {
              const placeholders = validTarifIds.map(() => "(?, ?)").join(", ");
              const values = validTarifIds.flatMap((tid) => [id, tid]);

              db.run(
                `INSERT INTO anggota_tarif (anggota_id, tarif_id) VALUES ${placeholders}`,
                values,
                (err) => {
                  if (err) {
                    console.error("Error inserting tarif:", err);
                  }
                }
              );
            }
          }

          res.json({ success: true, message: "Anggota berhasil diupdate" });
        });
      }
    );
  });
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM anggota WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }
    res.json({ success: true, message: "Anggota berhasil dihapus" });
  });
});

router.get("/detail/:id", (req, res) => {
  const { id } = req.params;
  const tahun = req.query.tahun || new Date().getFullYear();

  // Validate ID
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).send("ID anggota tidak valid");
  }

  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      if (err) {
        console.error("Error fetching organisasi:", err);
        organisasi = {};
      }

      // Get anggota data
      db.get("SELECT * FROM anggota WHERE id=?", [id], (err, anggota) => {
        if (err) {
          console.error("Error fetching anggota:", err);
          return res.status(500).send("Error database: " + err.message);
        }

        if (!anggota) {
          return res.status(404).send("Anggota tidak ditemukan");
        }

        // Get semua tarif
        db.all("SELECT * FROM tarif ORDER BY id DESC", [], (err, tarif) => {
          if (err) {
            console.error("Error fetching tarif:", err);
            tarif = [];
          }

          // Get tarif yang wajib dibayar oleh anggota ini
          db.all(
            `SELECT t.* FROM tarif t
             INNER JOIN anggota_tarif at ON t.id = at.tarif_id
             WHERE at.anggota_id = ?
             ORDER BY t.id DESC`,
            [id],
            (err, tarifAnggota) => {
              if (err) {
                console.error("Error fetching tarif anggota:", err);
                tarifAnggota = [];
              }

              // Get iuran data untuk tahun tertentu
              db.all(
                "SELECT * FROM iuran WHERE anggota_id=? AND tahun=? ORDER BY bulan ASC",
                [id, tahun],
                (err, iuran) => {
                  if (err) {
                    console.error("Error fetching iuran:", err);
                    iuran = [];
                  }

                  try {
                    // Set active flags based on user role
                    const userRole = req.session.user.role;
                    const active = {
                      anggota: true,
                      isAdmin: userRole === "admin",
                      isAdminOrPengurus:
                        userRole === "admin" || userRole === "pengurus",
                      isUser: userRole === "user",
                    };

                    const layout = renderHTML("detailAnggota.html", {
                      title: `Detail Anggota - ${anggota.nama}`,
                      user: req.session.user,
                      active: active,
                      content: "",
                      organisasi: organisasi || {},
                    });

                    // Replace template variables
                    const anggotaJson = JSON.stringify(anggota || {});
                    const iuranJson = JSON.stringify(iuran || []);
                    const tarifJson = JSON.stringify(tarif || []);
                    const tarifAnggotaJson = JSON.stringify(tarifAnggota || []);
                    const organisasiJson = JSON.stringify(organisasi || {});
                    let html = layout.replace(/\{\{anggota\}\}/g, anggotaJson);
                    html = html.replace(/\{\{iuran\}\}/g, iuranJson);
                    html = html.replace(/\{\{tarif\}\}/g, tarifJson);
                    html = html.replace(
                      /\{\{tarifAnggota\}\}/g,
                      tarifAnggotaJson
                    );
                    html = html.replace(/\{\{organisasi\}\}/g, organisasiJson);
                    html = html.replace(/\{\{tahun\}\}/g, tahun);
                    html = html.replace(
                      /\{\{user\.nama\}\}/g,
                      req.session.user.nama || ""
                    );
                    res.send(html);
                  } catch (renderError) {
                    console.error("Error rendering HTML:", renderError);
                    res
                      .status(500)
                      .send("Error rendering halaman: " + renderError.message);
                  }
                }
              );
            }
          );
        });
      });
    }
  );
});

// Endpoint untuk mengambil detail pembayaran per bulan atau berdasarkan frekuensi/tarif_id
router.get("/detail/:id/pembayaran", (req, res) => {
  const { id } = req.params;
  const { bulan, tahun, frekuensi, tarif_id } = req.query;

  // Validate parameters
  if (!id || isNaN(parseInt(id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID anggota tidak valid" });
  }

  let query = "SELECT * FROM iuran WHERE anggota_id=?";
  let params = [id];

  // Jika ada frekuensi dan tarif_id, gunakan filter berdasarkan itu
  if (frekuensi && tarif_id) {
    query += " AND frekuensi=? AND tarif_id=?";
    params.push(frekuensi, tarif_id);

    // Jika tahun juga diberikan (untuk tahunan), tambahkan filter tahun
    if (tahun && !isNaN(parseInt(tahun))) {
      query += " AND tahun=?";
      params.push(tahun);
    }
  } else {
    // Fallback ke logika lama: bulan dan tahun wajib
    if (!bulan || isNaN(parseInt(bulan)) || bulan < 1 || bulan > 12) {
      return res
        .status(400)
        .json({ success: false, message: "Bulan tidak valid" });
    }
    if (!tahun || isNaN(parseInt(tahun))) {
      return res
        .status(400)
        .json({ success: false, message: "Tahun tidak valid" });
    }

    query += " AND bulan=? AND tahun=?";
    params.push(bulan, tahun);
  }

  query += " ORDER BY tanggal_bayar DESC, created_at DESC";

  // Get all iuran based on filters
  db.all(query, params, (err, iuran) => {
    if (err) {
      console.error("Error fetching iuran detail:", err);
      return res
        .status(500)
        .json({ success: false, message: "Error database: " + err.message });
    }

    res.json({ success: true, data: iuran || [] });
  });
});

// Endpoint untuk mendapatkan tarif yang wajib dibayar oleh anggota
router.get("/:id/tarif", (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID anggota tidak valid" });
  }

  db.all(
    `SELECT t.* FROM tarif t
     INNER JOIN anggota_tarif at ON t.id = at.tarif_id
     WHERE at.anggota_id = ?
     ORDER BY t.id DESC`,
    [id],
    (err, tarif) => {
      if (err) {
        console.error("Error fetching anggota tarif:", err);
        return res
          .status(500)
          .json({ success: false, message: "Error database: " + err.message });
      }

      res.json({ success: true, data: tarif || [] });
    }
  );
});

// Endpoint untuk menambahkan tarif ke anggota
router.post("/:id/tarif", (req, res) => {
  const { id } = req.params;
  const { tarif_id } = req.body;

  if (!id || isNaN(parseInt(id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID anggota tidak valid" });
  }

  if (!tarif_id || isNaN(parseInt(tarif_id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID tarif tidak valid" });
  }

  db.run(
    "INSERT OR IGNORE INTO anggota_tarif (anggota_id, tarif_id) VALUES (?, ?)",
    [id, tarif_id],
    function (err) {
      if (err) {
        console.error("Error adding tarif to anggota:", err);
        return res.json({
          success: false,
          message: "Error simpan data: " + err.message,
        });
      }

      res.json({
        success: true,
        message: "Tarif berhasil ditambahkan ke anggota",
      });
    }
  );
});

// Endpoint untuk menghapus tarif dari anggota
router.delete("/:id/tarif/:tarif_id", (req, res) => {
  const { id, tarif_id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID anggota tidak valid" });
  }

  if (!tarif_id || isNaN(parseInt(tarif_id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID tarif tidak valid" });
  }

  db.run(
    "DELETE FROM anggota_tarif WHERE anggota_id=? AND tarif_id=?",
    [id, tarif_id],
    (err) => {
      if (err) {
        console.error("Error deleting tarif from anggota:", err);
        return res.json({
          success: false,
          message: "Error hapus data: " + err.message,
        });
      }

      res.json({
        success: true,
        message: "Tarif berhasil dihapus dari anggota",
      });
    }
  );
});

// Endpoint untuk update bulk tarif anggota (set semua tarif sekaligus)
router.put("/:id/tarif/bulk", (req, res) => {
  const { id } = req.params;
  const { tarif_ids } = req.body; // Array of tarif IDs

  if (!id || isNaN(parseInt(id))) {
    return res
      .status(400)
      .json({ success: false, message: "ID anggota tidak valid" });
  }

  if (!Array.isArray(tarif_ids)) {
    return res
      .status(400)
      .json({ success: false, message: "tarif_ids harus berupa array" });
  }

  // Validasi semua tarif_id adalah angka
  const validTarifIds = tarif_ids
    .map((tid) => parseInt(tid))
    .filter((tid) => !isNaN(tid));

  db.serialize(() => {
    // Mulai transaction
    db.run("BEGIN TRANSACTION");

    // Hapus semua tarif yang ada untuk anggota ini
    db.run("DELETE FROM anggota_tarif WHERE anggota_id=?", [id], (err) => {
      if (err) {
        db.run("ROLLBACK");
        console.error("Error deleting existing tarif:", err);
        return res.json({
          success: false,
          message: "Error update data: " + err.message,
        });
      }

      // Jika ada tarif yang dipilih, insert semuanya
      if (validTarifIds.length > 0) {
        const placeholders = validTarifIds.map(() => "(?, ?)").join(", ");
        const values = validTarifIds.flatMap((tid) => [id, tid]);

        db.run(
          `INSERT INTO anggota_tarif (anggota_id, tarif_id) VALUES ${placeholders}`,
          values,
          function (err) {
            if (err) {
              db.run("ROLLBACK");
              console.error("Error inserting tarif:", err);
              return res.json({
                success: false,
                message: "Error update data: " + err.message,
              });
            }

            db.run("COMMIT");
            res.json({
              success: true,
              message: "Tarif anggota berhasil diupdate",
            });
          }
        );
      } else {
        // Tidak ada tarif yang dipilih, commit saja
        db.run("COMMIT");
        res.json({
          success: true,
          message: "Tarif anggota berhasil diupdate (semua tarif dihapus)",
        });
      }
    });
  });
});

module.exports = router;
