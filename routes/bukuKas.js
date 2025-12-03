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
      db.all(
        "SELECT * FROM buku_kas ORDER BY tanggal DESC, id DESC",
        [],
        (err, bukuKas) => {
          db.get(
            "SELECT SUM(debet) as totalDebet, SUM(kredit) as totalKredit FROM buku_kas",
            [],
            (err, totals) => {
              db.get(
                "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
                [],
                (err, lastRow) => {
                  const stats = {
                    totalDebet: totals?.totalDebet || 0,
                    totalKredit: totals?.totalKredit || 0,
                    saldo: lastRow?.saldo || 0,
                  };

                  const layout = renderHTML("bukuKas.html", {
                    title: "Buku Kas",
                    user: req.session.user,
                    active: { bukuKas: true, isAdminOrPengurus: true },
                    content: "",
                    organisasi: organisasi || {},
                  });
                  // Replace template variables
                  const bukuKasJson = JSON.stringify(bukuKas || []);
                  const statsJson = JSON.stringify(stats);
                  const organisasiJson = JSON.stringify(organisasi || {});
                  let html = layout.replace(/\{\{bukuKas\}\}/g, bukuKasJson);
                  html = html.replace(/\{\{stats\}\}/g, statsJson);
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

router.get("/data", (req, res) => {
  db.all("SELECT * FROM buku_kas ORDER BY tanggal DESC", [], (err, bukuKas) => {
    res.json(bukuKas || []);
  });
});

router.post("/create", (req, res) => {
  const { tanggal, keterangan, kategori, debet, kredit } = req.body;

  // Get last saldo
  db.get(
    "SELECT saldo FROM buku_kas ORDER BY id DESC LIMIT 1",
    [],
    (err, lastRow) => {
      const lastSaldo = lastRow?.saldo || 0;
      const debetAmount = parseInt(debet) || 0;
      const kreditAmount = parseInt(kredit) || 0;
      const newSaldo = lastSaldo + debetAmount - kreditAmount;

      db.run(
        "INSERT INTO buku_kas (tanggal, keterangan, kategori, debet, kredit, saldo) VALUES (?, ?, ?, ?, ?, ?)",
        [tanggal, keterangan, kategori, debetAmount, kreditAmount, newSaldo],
        function (err) {
          if (err) {
            return res.json({ success: false, message: "Error simpan data" });
          }
          res.json({
            success: true,
            message: "Data buku kas berhasil ditambahkan",
          });
        }
      );
    }
  );
});

router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { tanggal, keterangan, kategori, debet, kredit } = req.body;

  // Recalculate saldo from beginning
  db.all("SELECT * FROM buku_kas ORDER BY id ASC", [], (err, allRows) => {
    let runningSaldo = 0;
    const updatedRows = allRows.map((row) => {
      if (row.id === parseInt(id)) {
        runningSaldo =
          runningSaldo + (parseInt(debet) || 0) - (parseInt(kredit) || 0);
        return {
          ...row,
          tanggal,
          keterangan,
          kategori,
          debet: parseInt(debet) || 0,
          kredit: parseInt(kredit) || 0,
          saldo: runningSaldo,
        };
      } else {
        runningSaldo = runningSaldo + (row.debet || 0) - (row.kredit || 0);
        return { ...row, saldo: runningSaldo };
      }
    });

    // Update the specific row
    const debetAmount = parseInt(debet) || 0;
    const kreditAmount = parseInt(kredit) || 0;
    const rowIndex = updatedRows.findIndex((r) => r.id === parseInt(id));
    const newSaldo =
      rowIndex > 0
        ? updatedRows[rowIndex - 1].saldo + debetAmount - kreditAmount
        : debetAmount - kreditAmount;

    db.run(
      "UPDATE buku_kas SET tanggal=?, keterangan=?, kategori=?, debet=?, kredit=?, saldo=? WHERE id=?",
      [tanggal, keterangan, kategori, debetAmount, kreditAmount, newSaldo, id],
      (err) => {
        if (err) {
          return res.json({ success: false, message: "Error update data" });
        }

        // Recalculate all subsequent rows
        db.all(
          "SELECT * FROM buku_kas WHERE id > ? ORDER BY id ASC",
          [id],
          (err, subsequentRows) => {
            let currentSaldo = newSaldo;
            subsequentRows.forEach((row) => {
              currentSaldo =
                currentSaldo + (row.debet || 0) - (row.kredit || 0);
              db.run("UPDATE buku_kas SET saldo=? WHERE id=?", [
                currentSaldo,
                row.id,
              ]);
            });
          }
        );

        res.json({ success: true, message: "Data buku kas berhasil diupdate" });
      }
    );
  });
});

router.delete("/delete/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM buku_kas WHERE id=?", [id], (err) => {
    if (err) {
      return res.json({ success: false, message: "Error hapus data" });
    }

    // Recalculate all saldo after delete
    db.all("SELECT * FROM buku_kas ORDER BY id ASC", [], (err, allRows) => {
      let runningSaldo = 0;
      allRows.forEach((row) => {
        runningSaldo = runningSaldo + (row.debet || 0) - (row.kredit || 0);
        db.run("UPDATE buku_kas SET saldo=? WHERE id=?", [
          runningSaldo,
          row.id,
        ]);
      });
    });

    res.json({ success: true, message: "Data buku kas berhasil dihapus" });
  });
});

module.exports = router;
