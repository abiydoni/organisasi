const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

router.get("/", (req, res) => {
  // Get organisasi data first
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      // Get statistics
      db.get(
        "SELECT COUNT(*) as count FROM anggota",
        [],
        (err, anggotaResult) => {
          db.get(
            'SELECT COUNT(*) as count FROM iuran WHERE status = "lunas"',
            [],
            (err, iuranResult) => {
              db.get(
                "SELECT SUM(debet) as total FROM buku_kas",
                [],
                (err, debetResult) => {
                  db.get(
                    "SELECT SUM(kredit) as total FROM buku_kas",
                    [],
                    (err, kreditResult) => {
                      const stats = {
                        anggota: anggotaResult?.count || 0,
                        iuranLunas: iuranResult?.count || 0,
                        totalMasuk: debetResult?.total || 0,
                        totalKeluar: kreditResult?.total || 0,
                      };

                      // Set active flags based on user role
                      const userRole = req.session.user.role;
                      const active = {
                        dashboard: true,
                        isAdmin: userRole === "admin",
                        isAdminOrPengurus:
                          userRole === "admin" || userRole === "pengurus",
                        isUser: userRole === "user",
                      };

                      const layout = renderHTML("dashboard.html", {
                        title: "Dashboard",
                        user: req.session.user,
                        active: active,
                        content: "",
                        organisasi: organisasi || {},
                      });

                      // Replace template variables
                      // Note: organisasi sudah di-inject di renderHTML, jadi tidak perlu replace lagi
                      const statsJson = JSON.stringify(stats);
                      let html = layout.replace(/\{\{stats\}\}/g, statsJson);
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
    }
  );
});

// Endpoint untuk data grafik
router.get("/chart-data", (req, res) => {
  const currentYear = new Date().getFullYear();
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  // Data pertumbuhan anggota per bulan (12 bulan terakhir)
  db.all(
    `SELECT 
      strftime('%Y-%m', created_at) as month,
      COUNT(*) as count
    FROM anggota
    WHERE created_at >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', created_at)
    ORDER BY month ASC`,
    [],
    (err, anggotaData) => {
      if (err) {
        console.error("Error fetching anggota chart data:", err);
      }

      // Data pembayaran iuran per bulan (12 bulan terakhir)
      db.all(
        `SELECT 
          strftime('%Y-%m', tanggal_bayar) as month,
          SUM(jumlah) as total
        FROM iuran
        WHERE status = 'lunas' 
          AND tanggal_bayar >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', tanggal_bayar)
        ORDER BY month ASC`,
        [],
        (err, iuranData) => {
          if (err) {
            console.error("Error fetching iuran chart data:", err);
          }

          // Data saldo kas per bulan (12 bulan terakhir) - ambil saldo terakhir di setiap bulan
          db.all(
            `SELECT 
              strftime('%Y-%m', tanggal) as month,
              saldo
            FROM buku_kas
            WHERE id IN (
              SELECT MAX(id)
              FROM buku_kas
              WHERE tanggal >= date('now', '-12 months')
              GROUP BY strftime('%Y-%m', tanggal)
            )
            ORDER BY month ASC`,
            [],
            (err, saldoData) => {
              if (err) {
                console.error("Error fetching saldo chart data:", err);
              }

              // Format data untuk chart
              const last12Months = [];
              const now = new Date();
              for (let i = 11; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthKey = `${date.getFullYear()}-${String(
                  date.getMonth() + 1
                ).padStart(2, "0")}`;
                last12Months.push({
                  key: monthKey,
                  label: `${months[date.getMonth()]} ${date.getFullYear()}`,
                });
              }

              // Map data anggota
              const anggotaMap = {};
              (anggotaData || []).forEach((item) => {
                anggotaMap[item.month] = parseInt(item.count);
              });

              // Map data iuran
              const iuranMap = {};
              (iuranData || []).forEach((item) => {
                iuranMap[item.month] = parseInt(item.total) || 0;
              });

              // Map data saldo
              const saldoMap = {};
              (saldoData || []).forEach((item) => {
                saldoMap[item.month] = parseInt(item.saldo) || 0;
              });

              // Build cumulative anggota data
              let cumulativeAnggota = 0;
              const anggotaChartData = last12Months.map((month) => {
                cumulativeAnggota += anggotaMap[month.key] || 0;
                return cumulativeAnggota;
              });

              // Build iuran data
              const iuranChartData = last12Months.map((month) => {
                return iuranMap[month.key] || 0;
              });

              // Build saldo data - gunakan saldo bulan sebelumnya jika tidak ada data
              let lastSaldo = 0;
              const saldoChartData = last12Months.map((month) => {
                if (saldoMap[month.key] !== undefined) {
                  lastSaldo = saldoMap[month.key];
                }
                return lastSaldo;
              });

              const labels = last12Months.map((m) => {
                const parts = m.label.split(" ");
                return parts[0]; // Hanya nama bulan
              });

              res.json({
                success: true,
                data: {
                  labels: labels,
                  anggota: {
                    label: "Total Anggota",
                    data: anggotaChartData,
                  },
                  iuran: {
                    label: "Pembayaran Iuran",
                    data: iuranChartData,
                  },
                  saldo: {
                    label: "Saldo Kas",
                    data: saldoChartData,
                  },
                },
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
