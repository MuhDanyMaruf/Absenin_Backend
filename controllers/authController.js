const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// 1. REGISTER USER BARU (Mendukung Username/NIS/NIP dan Email opsional)
const register = async (req, res) => {
  // Ambil 'username' dari body (ini akan menampung data NIS atau NIP dari frontend)
  const { username, email, password, role, kelas, jurusan, mengajar } =
    req.body;

  const client = await db.connect();

  try {
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Username/NIS/NIP, Password, dan Role wajib diisi",
      });
    }

    // Cek apakah username/NIS/NIP sudah terdaftar
    const userExist = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
    );
    if (userExist.rows.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Username/NIS/NIP sudah digunakan" });
    }

    await client.query("BEGIN");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let newUser;
    // Gunakan nilai email jika dikirim dari frontend, jika tidak ada berikan null
    const userEmail = email || null;

    if (role === "siswa") {
      newUser = await client.query(
        "INSERT INTO users (username, email, password, role, kelas, jurusan) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, role, kelas, jurusan",
        [username, userEmail, hashedPassword, role, kelas, jurusan],
      );
    } else {
      newUser = await client.query(
        "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role",
        [username, userEmail, hashedPassword, role],
      );
    }

    const newUserId = newUser.rows[0].id;

    if (role === "guru" && mengajar && Array.isArray(mengajar)) {
      for (const tugas of mengajar) {
        await client.query(
          "INSERT INTO guru_mengajar (guru_id, mapel_id, kelas_diajar) VALUES ($1, $2, $3)",
          [newUserId, tugas.mapel_id, tugas.kelas_diajar],
        );
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "User berhasil didaftarkan!",
      data: newUser.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error.message);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  } finally {
    client.release();
  }
};

// 2. LOGIN USER (Mendukung input Email atau NIS/NIP pada satu field input)
const login = async (req, res) => {
  let { identifier, password } = req.body;

  try {
    if (!identifier || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Semua field wajib diisi" });
    }

    // Bersihkan spasi di backend untuk cari aman
    identifier = identifier.trim();
    password = password.trim();

    // 1. Cari berdasarkan username ATAU email
    const result = await db.query(
      "SELECT * FROM users WHERE username = $1 OR email = $2",
      [identifier, identifier],
    );

    // 🔴 LOG PELACAK 1: Cek apakah user ketemu di database
    if (result.rows.length === 0) {
      console.log(
        `[Login Auth] Akun dengan identifier '${identifier}' TIDAK DITEMUKAN di database.`,
      );
      return res
        .status(400)
        .json({ success: false, message: "Identitas atau Password salah" });
    }

    const user = result.rows[0];
    console.log(
      `[Login Auth] Akun ditemukan! Role di DB: ${user.role}. Lanjut cek password...`,
    );

    // 2. Cek Match Password
    const isMatch = await bcrypt.compare(password, user.password);

    // 🔴 LOG PELACAK 2: Cek hasil perbandingan Bcrypt
    if (!isMatch) {
      console.log(
        `[Login Auth] Password untuk user '${identifier}' SALAH / TIDAK COCOK dengan hash.`,
      );
      return res
        .status(400)
        .json({ success: false, message: "Identitas atau Password salah" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    console.log(`[Login Auth] User '${identifier}' BERHASIL LOGIN!`);

    res.status(200).json({
      success: true,
      message: "Login berhasil!",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        kelas: user.kelas,
        jurusan: user.jurusan,
      },
    });
  } catch (error) {
    console.error("Error pada system login:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = { register, login };
