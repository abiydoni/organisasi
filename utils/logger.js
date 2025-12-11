const db = require("../config/database");

/**
 * Log aktivitas ke database
 * @param {Object} options - Opsi untuk logging
 * @param {number} options.userId - ID user yang melakukan aksi
 * @param {string} options.username - Username user yang melakukan aksi
 * @param {string} options.action - Jenis aksi (INSERT, UPDATE, DELETE, LOGIN, LOGOUT, dll)
 * @param {string} options.tableName - Nama tabel yang terpengaruh (opsional)
 * @param {number} options.recordId - ID record yang terpengaruh (opsional)
 * @param {string} options.description - Deskripsi aktivitas
 * @param {Object} options.oldData - Data lama (untuk UPDATE/DELETE)
 * @param {Object} options.newData - Data baru (untuk INSERT/UPDATE)
 * @param {Object} options.req - Request object untuk mendapatkan IP dan user agent
 */
function logActivity(options) {
  const {
    userId = null,
    username = null,
    action,
    tableName = null,
    recordId = null,
    description,
    oldData = null,
    newData = null,
    req = null,
  } = options;

  // Get IP address and user agent from request
  let ipAddress = null;
  let userAgent = null;

  if (req) {
    ipAddress =
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      null;
    userAgent = req.headers["user-agent"] || null;
  }

  // Convert objects to JSON strings
  const oldDataStr = oldData ? JSON.stringify(oldData) : null;
  const newDataStr = newData ? JSON.stringify(newData) : null;

  db.run(
    `INSERT INTO activity_log 
    (user_id, username, action, table_name, record_id, description, old_data, new_data, ip_address, user_agent) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      username,
      action,
      tableName,
      recordId,
      description,
      oldDataStr,
      newDataStr,
      ipAddress,
      userAgent,
    ],
    (err) => {
      if (err) {
        console.error("Error logging activity:", err);
      }
    }
  );
}

/**
 * Helper untuk log INSERT
 */
function logInsert(req, tableName, recordId, description, newData) {
  const userId = req.session?.user?.id || null;
  const username = req.session?.user?.username || null;

  logActivity({
    userId,
    username,
    action: "INSERT",
    tableName,
    recordId,
    description,
    newData,
    req,
  });
}

/**
 * Helper untuk log UPDATE
 */
function logUpdate(req, tableName, recordId, description, oldData, newData) {
  const userId = req.session?.user?.id || null;
  const username = req.session?.user?.username || null;

  logActivity({
    userId,
    username,
    action: "UPDATE",
    tableName,
    recordId,
    description,
    oldData,
    newData,
    req,
  });
}

/**
 * Helper untuk log DELETE
 */
function logDelete(req, tableName, recordId, description, oldData) {
  const userId = req.session?.user?.id || null;
  const username = req.session?.user?.username || null;

  logActivity({
    userId,
    username,
    action: "DELETE",
    tableName,
    recordId,
    description,
    oldData,
    req,
  });
}

/**
 * Helper untuk log LOGIN
 */
function logLogin(req, userId, username, success = true) {
  logActivity({
    userId: success ? userId : null,
    username: success ? username : null,
    action: success ? "LOGIN" : "LOGIN_FAILED",
    description: success
      ? `User ${username} berhasil login`
      : `Login gagal untuk username: ${username || "unknown"}`,
    req,
  });
}

/**
 * Helper untuk log LOGOUT
 */
function logLogout(req) {
  const userId = req.session?.user?.id || null;
  const username = req.session?.user?.username || null;

  logActivity({
    userId,
    username,
    action: "LOGOUT",
    description: `User ${username || "unknown"} logout`,
    req,
  });
}

module.exports = {
  logActivity,
  logInsert,
  logUpdate,
  logDelete,
  logLogin,
  logLogout,
};
