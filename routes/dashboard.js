const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { requireAuth } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

router.use(requireAuth);

router.get("/", (req, res) => {
  // Jika user adalah role "user", redirect ke dashboard user
  if (req.session.user.role === "user") {
    return res.redirect("/dashboard/user");
  }

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
                        isTentor: userRole === "tentor",
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

// Dashboard khusus untuk role user
router.get("/user", (req, res) => {
  // Pastikan hanya user yang bisa akses
  if (req.session.user.role !== "user") {
    return res.redirect("/dashboard");
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

      // Get anggota data berdasarkan nama user
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

          const anggotaId = anggota.id;
          const tahunSaatIni = new Date().getFullYear();

          // Get total tarif bulanan untuk anggota ini
          db.get(
            `SELECT COALESCE(SUM(t.jumlah), 0) as totalTarifBulanan
            FROM tarif t
            INNER JOIN anggota_tarif at ON t.id = at.tarif_id
            WHERE at.anggota_id = ? 
              AND t.status = 'aktif'
              AND (t.frekuensi = 'bulanan' OR t.frekuensi IS NULL OR t.frekuensi = '')`,
            [anggotaId],
            (err, tarifResult) => {
              if (err) {
                console.error("Error fetching tarif:", err);
                tarifResult = { totalTarifBulanan: 0 };
              }

              const totalTarifBulanan = tarifResult?.totalTarifBulanan || 0;

              // Get total pembayaran bulanan untuk tahun ini
              db.get(
                `SELECT COALESCE(SUM(jumlah), 0) as totalBayarBulanan
                FROM iuran 
                WHERE anggota_id = ? 
                  AND tahun = ?
                  AND (frekuensi = 'bulanan' OR frekuensi IS NULL OR frekuensi = '')`,
                [anggotaId, tahunSaatIni],
                (err, pembayaranBulananResult) => {
                  if (err) {
                    console.error("Error fetching pembayaran bulanan:", err);
                    pembayaranBulananResult = { totalBayarBulanan: 0 };
                  }

                  const totalBayarBulanan =
                    pembayaranBulananResult?.totalBayarBulanan || 0;

                  // Get total pembayaran per bulan untuk perhitungan statistik
                  db.all(
                    `SELECT 
                      bulan,
                      SUM(jumlah) as totalBayar
                    FROM iuran 
                    WHERE anggota_id = ? 
                      AND tahun = ?
                      AND (frekuensi = 'bulanan' OR frekuensi IS NULL OR frekuensi = '')
                    GROUP BY bulan`,
                    [anggotaId, tahunSaatIni],
                    (err, pembayaranPerBulan) => {
                      if (err) {
                        console.error(
                          "Error fetching pembayaran per bulan:",
                          err
                        );
                        pembayaranPerBulan = [];
                      }

                      // Hitung statistik berdasarkan sisa
                      let totalTagihan = 0; // Semua tagihan yang belum lunas (sisa > 0) - termasuk yang belum bayar dan yang sudah bayar sebagian
                      let tagihanLunas = 0; // Tagihan yang sisa = 0 (benar-benar lunas)
                      let belumLunas = 0; // Sudah ada pembayaran tapi sisa belum nol (sisa > 0 dan totalBayar > 0)

                      // Buat map pembayaran per bulan
                      const pembayaranMap = {};
                      pembayaranPerBulan.forEach((p) => {
                        pembayaranMap[p.bulan] = p.totalBayar || 0;
                      });

                      // Hitung untuk setiap bulan (1-12)
                      for (let bulan = 1; bulan <= 12; bulan++) {
                        const totalBayarBulan = pembayaranMap[bulan] || 0;
                        const sisa = Math.max(
                          0,
                          totalTarifBulanan - totalBayarBulan
                        );

                        if (sisa === 0) {
                          // Lunas (sisa benar-benar nol)
                          tagihanLunas++;
                        } else if (sisa > 0) {
                          // Belum lunas - masuk ke total tagihan
                          totalTagihan++;
                          if (totalBayarBulan > 0) {
                            // Sudah ada pembayaran tapi sisa belum nol
                            belumLunas++;
                          }
                        }
                      }

                      // Function untuk melanjutkan dengan stats
                      function continueWithStats(tagihanStats) {
                        // Get statistics untuk penilaian
                        db.get(
                          `SELECT 
                            COUNT(*) as total,
                            AVG(nilai) as rataRata,
                            MAX(nilai) as nilaiTertinggi,
                            MIN(nilai) as nilaiTerendah
                          FROM penilaian 
                          WHERE anggota_id = ?`,
                          [anggotaId],
                          (err, penilaianStats) => {
                            if (err) {
                              console.error(
                                "Error fetching penilaian stats:",
                                err
                              );
                              penilaianStats = {
                                total: 0,
                                rataRata: 0,
                                nilaiTertinggi: 0,
                                nilaiTerendah: 0,
                              };
                            }

                            // Get statistics untuk scoring panahan
                            db.get(
                              `SELECT 
                                COUNT(*) as totalGame,
                                SUM(total_score) as totalScore,
                                AVG(total_score) as rataRataScore,
                                MAX(total_score) as scoreTertinggi
                              FROM panahan_game 
                              WHERE anggota_id = ?`,
                              [anggotaId],
                              (err, scoringStats) => {
                                if (err) {
                                  console.error(
                                    "Error fetching scoring stats:",
                                    err
                                  );
                                  scoringStats = {
                                    totalGame: 0,
                                    totalScore: 0,
                                    rataRataScore: 0,
                                    scoreTertinggi: 0,
                                  };
                                }

                                const stats = {
                                  tagihan: {
                                    total: tagihanStats?.total || 0,
                                    lunas: tagihanStats?.lunas || 0,
                                    belumLunas: tagihanStats?.belumLunas || 0,
                                    totalBayar: tagihanStats?.totalBayar || 0,
                                  },
                                  penilaian: {
                                    total: penilaianStats?.total || 0,
                                    rataRata: parseFloat(
                                      penilaianStats?.rataRata || 0
                                    ).toFixed(2),
                                    nilaiTertinggi:
                                      penilaianStats?.nilaiTertinggi || 0,
                                    nilaiTerendah:
                                      penilaianStats?.nilaiTerendah || 0,
                                  },
                                  scoring: {
                                    totalGame: scoringStats?.totalGame || 0,
                                    totalScore: scoringStats?.totalScore || 0,
                                    rataRataScore: parseFloat(
                                      scoringStats?.rataRataScore || 0
                                    ).toFixed(2),
                                    scoreTertinggi:
                                      scoringStats?.scoreTertinggi || 0,
                                  },
                                };

                                // Set active flags - pastikan semua flag admin/pengurus/tentor false untuk user
                                const active = {
                                  dashboard: true,
                                  isUser: true,
                                  isAdmin: false,
                                  isAdminOrPengurus: false,
                                  isAdminOrPengurusOrTentor: false,
                                  isTentor: false,
                                };

                                const layout = renderHTML(
                                  "dashboardUser.html",
                                  {
                                    title: "Dashboard Saya",
                                    user: req.session.user,
                                    active: active,
                                    content: "",
                                    organisasi: organisasi || {},
                                  }
                                );

                                // Replace template variables
                                const statsJson = JSON.stringify(stats);
                                const organisasiJson = JSON.stringify(
                                  organisasi || {}
                                );
                                let html = layout.replace(
                                  /\{\{stats\}\}/g,
                                  statsJson
                                );
                                html = html.replace(
                                  /\{\{organisasi\}\}/g,
                                  organisasiJson
                                );
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

                      // Hitung untuk iuran lain (tahunan dan seumur_hidup)
                      db.all(
                        `SELECT t.id, t.nama, t.jumlah, t.frekuensi
                        FROM tarif t
                        INNER JOIN anggota_tarif at ON t.id = at.tarif_id
                        WHERE at.anggota_id = ? 
                          AND t.status = 'aktif'
                          AND (t.frekuensi = 'tahunan' OR t.frekuensi = 'seumur_hidup')`,
                        [anggotaId],
                        (err, tarifLain) => {
                          if (err) {
                            console.error("Error fetching tarif lain:", err);
                            tarifLain = [];
                          }

                          // Hitung total tarif lain
                          let totalTarifLain = 0;
                          tarifLain.forEach((tarif) => {
                            totalTarifLain += tarif.jumlah || 0;
                          });

                          // Hitung total pembayaran iuran lain
                          let totalBayarLain = 0;
                          let processedCount = 0;
                          const totalTarifLainCount = tarifLain.length;

                          if (tarifLain.length === 0) {
                            // Tidak ada iuran lain, langsung hitung total tagihan
                            const totalSisaTagihan = Math.max(
                              0,
                              totalTarifBulanan * 12 +
                                totalTarifLain -
                                totalBayarBulanan -
                                totalBayarLain
                            );

                            // Total Pembayaran = Total Pembayaran Bulanan + Total Pembayaran Lain
                            const totalBayarSemua =
                              totalBayarBulanan + totalBayarLain;

                            const tagihanStats = {
                              total: totalTagihan,
                              lunas: tagihanLunas,
                              belumLunas: totalSisaTagihan, // Total tagihan dalam rupiah
                              totalBayar: totalBayarSemua,
                            };
                            continueWithStats(tagihanStats);
                            return;
                          }

                          // Hitung pembayaran untuk setiap iuran lain
                          tarifLain.forEach((tarif) => {
                            let query = `SELECT COALESCE(SUM(jumlah), 0) as totalBayar
                              FROM iuran 
                              WHERE anggota_id = ? 
                                AND tarif_id = ?
                                AND frekuensi = ?`;
                            let params = [anggotaId, tarif.id, tarif.frekuensi];

                            // Jika tahunan, filter berdasarkan tahun
                            if (tarif.frekuensi === "tahunan") {
                              query += " AND tahun = ?";
                              params.push(tahunSaatIni);
                            }

                            db.get(query, params, (err, result) => {
                              if (err) {
                                console.error(
                                  "Error fetching pembayaran iuran lain:",
                                  err
                                );
                                processedCount++;
                                checkComplete();
                                return;
                              }

                              const totalBayarTarif = result?.totalBayar || 0;
                              totalBayarLain += totalBayarTarif;

                              const sisa = Math.max(
                                0,
                                tarif.jumlah - totalBayarTarif
                              );

                              if (sisa === 0) {
                                // Lunas
                                tagihanLunas++;
                              } else if (sisa > 0) {
                                // Belum lunas - masuk ke total tagihan
                                totalTagihan++;
                                if (totalBayarTarif > 0) {
                                  // Sudah ada pembayaran tapi sisa belum nol
                                  belumLunas++;
                                }
                              }

                              processedCount++;
                              checkComplete();
                            });
                          });

                          function checkComplete() {
                            if (processedCount >= totalTarifLainCount) {
                              // Total Tagihan = (Total Tarif Bulanan * 12) + Total Tarif Lain - Total Pembayaran Bulanan - Total Pembayaran Lain
                              const totalSisaTagihan = Math.max(
                                0,
                                totalTarifBulanan * 12 +
                                  totalTarifLain -
                                  totalBayarBulanan -
                                  totalBayarLain
                              );

                              // Total Pembayaran = Total Pembayaran Bulanan + Total Pembayaran Lain
                              const totalBayarSemua =
                                totalBayarBulanan + totalBayarLain;

                              const tagihanStats = {
                                total: totalTagihan,
                                lunas: tagihanLunas,
                                belumLunas: totalSisaTagihan, // Total tagihan dalam rupiah
                                totalBayar: totalBayarSemua,
                              };
                              continueWithStats(tagihanStats);
                            }
                          }
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
    }
  );
});

// Endpoint untuk data grafik user
router.get("/user/chart-data", (req, res) => {
  // Pastikan hanya user yang bisa akses
  if (req.session.user.role !== "user") {
    return res.json({ success: false, message: "Akses ditolak" });
  }

  // Get anggota data berdasarkan nama user
  db.get(
    "SELECT * FROM anggota WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) LIMIT 1",
    [req.session.user.nama],
    (err, anggota) => {
      if (err || !anggota) {
        return res.json({ success: false, message: "Anggota tidak ditemukan" });
      }

      const anggotaId = anggota.id;
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

      // Data tagihan per bulan (12 bulan terakhir)
      db.all(
        `SELECT 
          strftime('%Y-%m', tanggal_bayar) as month,
          SUM(CASE WHEN status = 'lunas' THEN jumlah ELSE 0 END) as totalBayar,
          COUNT(CASE WHEN status = 'lunas' THEN 1 END) as jumlahLunas
        FROM iuran
        WHERE anggota_id = ? 
          AND tanggal_bayar >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', tanggal_bayar)
        ORDER BY month ASC`,
        [anggotaId],
        (err, tagihanData) => {
          if (err) {
            console.error("Error fetching tagihan chart data:", err);
          }

          // Data penilaian per bulan (12 bulan terakhir)
          db.all(
            `SELECT 
              strftime('%Y-%m', created_at) as month,
              AVG(nilai) as rataRata,
              COUNT(*) as jumlah
            FROM penilaian
            WHERE anggota_id = ? 
              AND created_at >= date('now', '-12 months')
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month ASC`,
            [anggotaId],
            (err, penilaianData) => {
              if (err) {
                console.error("Error fetching penilaian chart data:", err);
              }

              // Data scoring per bulan (12 bulan terakhir)
              db.all(
                `SELECT 
                  strftime('%Y-%m', tanggal) as month,
                  SUM(total_score) as totalScore,
                  COUNT(*) as jumlahGame,
                  AVG(total_score) as rataRataScore
                FROM panahan_game
                WHERE anggota_id = ? 
                  AND tanggal >= date('now', '-12 months')
                GROUP BY strftime('%Y-%m', tanggal)
                ORDER BY month ASC`,
                [anggotaId],
                (err, scoringData) => {
                  if (err) {
                    console.error("Error fetching scoring chart data:", err);
                  }

                  // Format data untuk chart
                  const last12Months = [];
                  const now = new Date();
                  for (let i = 11; i >= 0; i--) {
                    const date = new Date(
                      now.getFullYear(),
                      now.getMonth() - i,
                      1
                    );
                    const monthKey = `${date.getFullYear()}-${String(
                      date.getMonth() + 1
                    ).padStart(2, "0")}`;
                    last12Months.push({
                      key: monthKey,
                      label: `${months[date.getMonth()]} ${date.getFullYear()}`,
                    });
                  }

                  // Map data tagihan
                  const tagihanMap = {};
                  (tagihanData || []).forEach((item) => {
                    tagihanMap[item.month] = {
                      totalBayar: parseInt(item.totalBayar) || 0,
                      jumlahLunas: parseInt(item.jumlahLunas) || 0,
                    };
                  });

                  // Map data penilaian
                  const penilaianMap = {};
                  (penilaianData || []).forEach((item) => {
                    penilaianMap[item.month] = {
                      rataRata: parseFloat(item.rataRata) || 0,
                      jumlah: parseInt(item.jumlah) || 0,
                    };
                  });

                  // Map data scoring
                  const scoringMap = {};
                  (scoringData || []).forEach((item) => {
                    scoringMap[item.month] = {
                      totalScore: parseInt(item.totalScore) || 0,
                      jumlahGame: parseInt(item.jumlahGame) || 0,
                      rataRataScore: parseFloat(item.rataRataScore) || 0,
                    };
                  });

                  // Build chart data
                  const labels = last12Months.map((m) => {
                    const parts = m.label.split(" ");
                    return parts[0]; // Hanya nama bulan
                  });

                  const tagihanChartData = last12Months.map((month) => {
                    return tagihanMap[month.key]?.totalBayar || 0;
                  });

                  const penilaianChartData = last12Months.map((month) => {
                    return penilaianMap[month.key]?.rataRata || 0;
                  });

                  const scoringChartData = last12Months.map((month) => {
                    return scoringMap[month.key]?.rataRataScore || 0;
                  });

                  res.json({
                    success: true,
                    data: {
                      labels: labels,
                      tagihan: {
                        label: "Total Pembayaran (Rp)",
                        data: tagihanChartData,
                      },
                      penilaian: {
                        label: "Rata-rata Nilai",
                        data: penilaianChartData,
                      },
                      scoring: {
                        label: "Rata-rata Score",
                        data: scoringChartData,
                      },
                    },
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

module.exports = router;
