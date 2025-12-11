const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { renderHTML } = require("../utils/render");
const db = require("../config/database");

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

module.exports = router;
