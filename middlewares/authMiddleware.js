const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Mengambil token dari header request (Authorization: Bearer <token>)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Akses ditolak, token tidak ditemukan' });
  }

  try {
    // Verifikasi token
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // Menyimpan data id & role user ke object request
    next(); // Lanjut ke fungsi berikutnya (Controller)
  } catch (error) {
    res.status(403).json({ success: false, message: 'Token tidak valid atau kadaluwarsa' });
  }
};

module.exports = verifyToken;