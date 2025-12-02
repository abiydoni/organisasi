const db = require("../config/database");

// Middleware untuk mengambil data organisasi dan attach ke req
function getOrganisasi(req, res, next) {
  db.get(
    "SELECT * FROM organisasi ORDER BY id DESC LIMIT 1",
    [],
    (err, organisasi) => {
      req.organisasi = organisasi || {};
      next();
    }
  );
}

module.exports = { getOrganisasi };
