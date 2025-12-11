function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/auth/login");
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === "admin") {
    return next();
  }
  res.status(403).send("Akses ditolak");
}

function requireAdminOrPengurus(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    (req.session.user.role === "admin" || req.session.user.role === "pengurus")
  ) {
    return next();
  }
  res.status(403).send("Akses ditolak");
}

function requireUser(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/auth/login");
  }
  if (req.session.user.role === "user") {
    return next();
  }
  res
    .status(403)
    .send("Akses ditolak. Hanya role user yang dapat mengakses halaman ini.");
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireAdminOrPengurus,
  requireUser,
};
