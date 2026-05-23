require("dotenv").config();

// BARIS SAKTI: Memaksa Node.js mengabaikan masalah sertifikat SSL untuk seluruh sistem
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const cors = require("cors");
const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");

const app = express();
const PORT = process.env.PORT || 5000;
const whitelist = [
  "http://localhost:5173",
  "https://absenin-frontend.vercel.app",
];

// =========================================================================
// MIDDLEWARE GLOBAL & KONFIGURASI CORS
// =========================================================================
// Diperbarui agar lebih spesifik mengizinkan port lokal frontend Vue kamu (5173)
// ====================================================================================
// MIDDLEWARE GLOBAL & KONFIGURASI CORS
// ====================================================================================
// Diperbarui agar lebih spesifik mengizinkan port lokal frontend Vue kamu (5173)
app.use(
  cors({
    origin: function (origin, callback) {
      // Izinkan jika rute terdaftar di whitelist, atau jika request tidak memiliki origin (seperti Postman)
      if (!origin || whitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Ditolak oleh sistem keamanan CORS Global!"));
      }
    },
    credentials: true
  }) // 🌟 PERBAIKAN: Tanda koma di sini sudah DIHAPUS bersih
);

app.use(express.json()); // Agar server bisa membaca data format JSON

// =========================================================================
// REGISTER ROUTES (URL: http://localhost:5000/api/auth/register atau /login)
// =========================================================================
app.use("/api/auth", authRoutes); // Mendaftarkan rute login & register di URL /api/auth

// =========================================================================
// ENDPOINT API SISWA & ABSENSI
// =========================================================================

// Endpoint API 1: Mengambil Semua Data Siswa
app.get("/api/siswa", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM siswa ORDER BY nama_lengkap ASC",
    );
    res.status(200).json({
      success: true,
      message: "Berhasil mengambil data siswa",
      data: result.rows,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// Endpoint API 2: Input Absensi Oleh Guru
app.post("/api/absensi", async (req, res) => {
  const { siswa_id, status, keterangan, diabsen_oleh } = req.body;
  try {
    const newAbsen = await db.query(
      `INSERT INTO absensi (siswa_id, status, keterangan, diabsen_oleh) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [siswa_id, status, keterangan, diabsen_oleh],
    );

    res.status(201).json({
      success: true,
      message: "Absensi berhasil dicatat!",
      data: newAbsen.rows[0],
    });
  } catch (error) {
    // Jika mendeteksi error unique_siswa_per_hari yang kita buat di database
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Siswa ini sudah diabsen hari ini!",
      });
    }
    console.error(error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ENDPOINT DARURAT: Jalankan sekali untuk mendapatkan hash password admin yang valid
app.get("/api/buat-hash-admin", async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("admin130903", salt);

    res.send(`
      <div style="font-family:sans-serif; padding:20px;">
        <h3>Salin Kode Hash di Bawah Ini:</h3>
        <code style="background:#f1f1f1; padding:8px; border-radius:4px; font-size:16px; display:block; word-break:break-all;">
          ${hashedPassword}
        </code>
      </div>
    `);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Endpoint Statistik Dashboard Admin - PERBAIKAN TOTAL
app.get("/api/admin/dashboard-stats", async (req, res) => {
  try {
    // 1. Hitung total siswa (LOWER digunakan untuk mengantisipasi kapitalisasi)
    const siswaCount = await db.query(
      "SELECT COUNT(*) FROM users WHERE LOWER(role) = 'siswa'",
    );

    // 2. Hitung total guru
    const guruCount = await db.query(
      "SELECT COUNT(*) FROM users WHERE LOWER(role) = 'guru'",
    );

    // 3. Hitung absen masuk hari ini menggunakan kolom 'created_at' yang valid di Postgres/Supabase
    const absenToday = await db.query(
      "SELECT COUNT(*) FROM absensi WHERE DATE(created_at) = CURRENT_DATE",
    );

    res.status(200).json({
      success: true,
      data: {
        totalSiswa: parseInt(siswaCount.rows[0].count) || 0,
        totalGuru: parseInt(guruCount.rows[0].count) || 0,
        totalAbsenHariIni: parseInt(absenToday.rows[0].count) || 0,
      },
    });
  } catch (error) {
    // Mencetak error spesifik ke terminal jika masih ada kolom yang tidak sinkron
    console.error("Error pada statistik dashboard:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik dashboard",
      error: error.message,
    });
  }
});

app.get("/api/admin/users/siswa", async (req, res) => {
  try {
    const queryText = `
      SELECT 
        u.id::INT AS id,                       
        u.email::TEXT AS email,
        u.username::TEXT AS username,
        s.nisn::TEXT AS nisn,                 
        s.nama_lengkap::TEXT AS nama_lengkap, 
        s.jenis_kelamin::TEXT AS jenis_kelamin, 
        k.nama_kelas::TEXT AS kelas,      
        s.kelas_id::INT AS kelas_id
      FROM users u
      LEFT JOIN siswa s ON u.id = s.user_id
      LEFT JOIN kelas k ON s.kelas_id = k.id
      WHERE u.role = 'siswa'
      ORDER BY k.nama_kelas ASC, s.nama_lengkap ASC
    `;

    const result = await db.query(queryText);

    // Kirim respons hasil gabungan ke frontend
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Gagal mengambil data master siswa:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1. Mengambil data list berdasarkan role (guru atau siswa)
// Endpoint Baru yang Diperbaiki (Aman dari Huruf Kapital)
app.get("/api/admin/users/:role", async (req, res) => {
  const { role } = req.params; // berisi 'siswa' atau 'guru'

  try {
    // Menggunakan LOWER(role) agar mencocokkan huruf kecil semua dari database
    const result = await db.query(
      `SELECT id, username, email, role, kelas, jurusan, created_at 
       FROM users 
       WHERE LOWER(role) = LOWER($1) 
       ORDER BY id DESC`,
      [role],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error mengambil list data admin:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 2. Menghapus user berdasarkan ID
app.delete("/api/admin/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM users WHERE id = $1", [id]);
    res.status(200).json({ success: true, message: "User berhasil dihapus!" });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ success: false, message: "Gagal menghapus user" });
  }
});

// Endpoint API: Memperbarui data Guru atau Siswa berdasarkan ID
app.put("/api/admin/users/:id", async (req, res) => {
  const { id } = req.params;
  const { username, email, kelas, jurusan, password } = req.body;

  try {
    // 1. Cek dulu apakah user-nya ada
    const userExist = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (userExist.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan" });
    }

    let queryText;
    let queryParams;

    // 2. Logika jika admin juga ingin mengganti password akun tersebut
    if (password && password.trim() !== "") {
      const bcrypt = require("bcryptjs");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password.trim(), salt);

      queryText = `
        UPDATE users 
        SET username = $1, email = $2, kelas = $3, jurusan = $4, password = $5 
        WHERE id = $6 
        RETURNING id, username, email, role
      `;
      queryParams = [
        username.trim(),
        email ? email.trim() : null,
        kelas,
        jurusan,
        hashedPassword,
        id,
      ];
    } else {
      // Jika password dikosongkan, update data selain password
      queryText = `
        UPDATE users 
        SET username = $1, email = $2, kelas = $3, jurusan = $4 
        WHERE id = $5 
        RETURNING id, username, email, role
      `;
      queryParams = [
        username.trim(),
        email ? email.trim() : null,
        kelas,
        jurusan,
        id,
      ];
    }

    const result = await db.query(queryText, queryParams);

    res.status(200).json({
      success: true,
      message: "Data berhasil diperbarui!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error saat update user:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Gagal memperbarui data user" });
  }
});

// READ: Ambil Semua Jurusan
app.get("/api/admin/jurusan", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM jurusan ORDER BY nama_jurusan ASC",
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// CREATE: Tambah Jurusan Baru
app.post("/api/admin/jurusan", async (req, res) => {
  const { nama_jurusan } = req.body;
  if (!nama_jurusan)
    return res
      .status(400)
      .json({ success: false, message: "Nama jurusan wajib diisi" });

  try {
    const result = await db.query(
      "INSERT INTO jurusan (nama_jurusan) VALUES ($1) RETURNING *",
      [nama_jurusan.trim().toUpperCase()],
    );
    res.status(201).json({
      success: true,
      message: "Jurusan berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Jurusan sudah ada atau error sistem" });
  }
});

// UPDATE: Edit Nama Jurusan
app.put("/api/admin/jurusan/:id", async (req, res) => {
  const { id } = req.params;
  const { nama_jurusan } = req.body;
  try {
    const result = await db.query(
      "UPDATE jurusan SET nama_jurusan = $1 WHERE id = $2 RETURNING *",
      [nama_jurusan.trim().toUpperCase(), id],
    );
    res.status(200).json({
      success: true,
      message: "Jurusan berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Jurusan
app.delete("/api/admin/jurusan/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM jurusan WHERE id = $1", [id]);
    res
      .status(200)
      .json({ success: true, message: "Jurusan berhasil dihapus" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus. Data mungkin sedang digunakan.",
    });
  }
});

// ==========================================
// CRUD TABEL KELAS (ADMIN ONLY)
// ==========================================

// READ: Ambil Semua Kelas
app.get("/api/admin/kelas", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM kelas ORDER BY nama_kelas ASC",
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// CREATE: Tambah Kelas Baru
app.post("/api/admin/kelas", async (req, res) => {
  const { nama_kelas } = req.body;
  if (!nama_kelas)
    return res
      .status(400)
      .json({ success: false, message: "Nama kelas wajib diisi" });

  try {
    const result = await db.query(
      "INSERT INTO kelas (nama_kelas) VALUES ($1) RETURNING *",
      [nama_kelas.trim().toUpperCase()],
    );
    res.status(201).json({
      success: true,
      message: "Kelas berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Kelas sudah ada atau error sistem" });
  }
});

// UPDATE: Edit Nama Kelas
app.put("/api/admin/kelas/:id", async (req, res) => {
  const { id } = req.params;
  const { nama_kelas } = req.body;
  try {
    const result = await db.query(
      "UPDATE kelas SET nama_kelas = $1 WHERE id = $2 RETURNING *",
      [nama_kelas.trim().toUpperCase(), id],
    );
    res.status(200).json({
      success: true,
      message: "Kelas berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Kelas
app.delete("/api/admin/kelas/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM kelas WHERE id = $1", [id]);
    res.status(200).json({ success: true, message: "Kelas berhasil dihapus" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus. Data mungkin sedang digunakan.",
    });
  }
});

// ==========================================
// CRUD MATA PELAJARAN (ADMIN ONLY)
// ==========================================

// 1. Ambil Semua Mapel
app.get("/api/admin/mapel", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM mata_pelajaran ORDER BY nama_mapel ASC",
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Tambah Mapel Baru
app.post("/api/admin/mapel", async (req, res) => {
  const { nama_mapel } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO mata_pelajaran (nama_mapel) VALUES ($1) RETURNING *",
      [nama_mapel.trim().toUpperCase()],
    );
    res.status(201).json({
      success: true,
      message: "Mata pelajaran berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Mata pelajaran sudah terdaftar" });
  }
});

// 3. Hapus Mapel
app.delete("/api/admin/mapel/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM mata_pelajaran WHERE id = $1", [req.params.id]);
    res
      .status(200)
      .json({ success: true, message: "Mata pelajaran berhasil dihapus" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus. Data mungkin sedang digunakan di jadwal.",
    });
  }
});

// ==========================================
// OPERASI PLOTTING JADWAL MENGAJAR GURU
// ==========================================

// 1. Ambil Seluruh Jadwal Mengajar Lengkap (Untuk ditampilkan di tabel detail admin)
// Endpoint GET Jadwal Induk (Disesuaikan dengan format JOIN tabel kelas)
app.get("/api/admin/jadwal-induk", async (req, res) => {
  try {
    const queryText = `
      SELECT 
        jp.id,
        u.username AS nama_guru,
        mp.nama_mapel,
        k.nama_kelas AS kelas_id, -- Mengambil nama string teks dari tabel kelas menggunakan JOIN
        jp.hari,
        jp.jam_mulai,
        jp.jam_selesai
      FROM jadwal_pelajaran jp
      JOIN users u ON jp.guru_id = u.id
      JOIN mata_pelajaran mp ON jp.mapel_id = mp.id
      JOIN kelas k ON jp.kelas_id = k.id -- Hubungkan ID angka ke master tabel kelas
      ORDER BY 
        CASE 
          WHEN hari = 'Senin' THEN 1
          WHEN hari = 'Selasa' THEN 2
          WHEN hari = 'Rabu' THEN 3
          WHEN hari = 'Kamis' THEN 4
          WHEN hari = 'Jumat' THEN 5
          WHEN hari = 'Sabtu' THEN 6
          ELSE 7
        END, jp.jam_mulai ASC
    `;
    const result = await db.query(queryText);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint Plotting Jadwal Guru (Perbaikan Masalah Integer kelas_id)
app.post("/api/admin/jadwal-induk", async (req, res) => {
  const { guru_id, mapel_id, kelas_diajar, hari, jam_mulai, jam_selesai } =
    req.body;

  try {
    await db.query("BEGIN");

    // 1. CARI ID ANGKA DARI TABEL KELAS BERDASARKAN STRING NAMA KELAS
    const cariKelas = await db.query(
      "SELECT id FROM kelas WHERE nama_kelas = $1",
      [kelas_diajar],
    );

    if (cariKelas.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: `Kelas '${kelas_diajar}' tidak ditemukan di data master kelas.`,
      });
    }

    const kelasIdAngka = cariKelas.rows[0].id; // Ini akan menghasilkan angka integer (contoh: 1, 2, dll)

    // 2. Masukkan ke tabel guru_mengajar (menggunakan string teks seperti struktur lamamu)
    await db.query(
      `
      INSERT INTO guru_mengajar (guru_id, mapel_id, kelas_diajar) 
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `,
      [guru_id, mapel_id, kelas_diajar],
    );

    // 3. Masukkan ke tabel jadwal_pelajaran (menggunakan ID Angka yang valid untuk kelas_id)
    const resultJadwal = await db.query(
      `
      INSERT INTO jadwal_pelajaran (guru_id, mapel_id, kelas_id, hari, jam_mulai, jam_selesai)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [guru_id, mapel_id, kelasIdAngka, hari, jam_mulai, jam_selesai],
    );

    await db.query("COMMIT");
    res.status(201).json({
      success: true,
      message: "Plotting jadwal guru berhasil disimpan!",
      data: resultJadwal.rows[0],
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Error plotting jadwal:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan jadwal: " + error.message,
    });
  }
});

// PASTIKAN DI SERVER.JS KODE INI SUDAH ADA DAN TERTULIS SEPERTI INI:
app.post("/api/admin/siswa", async (req, res) => {
  const { username, email, password, nama_siswa, nis, gender, kelas_id } =
    req.body;

  try {
    await db.query("BEGIN");

    // 1. Amankan akun login ke tabel users
    const userResult = await db.query(
      `INSERT INTO users (username, email, password, role) 
        VALUES ($1, $2, $3, 'siswa') RETURNING id`,
      [username, email, password],
    );

    const newUserId = userResult.rows[0].id;

    // 2. Masukkan ke tabel siswa menggunakan nama kolom asli Supabase:
    // user_id, nisn, nama_lengkap, jenis_kelamin, kelas_id
    await db.query(
      `INSERT INTO siswa (user_id, nisn, nama_lengkap, jenis_kelamin, kelas_id) 
        VALUES ($1, $2, $3, $4, $5)`,
      [newUserId, nis, nama_siswa, gender, kelas_id], // gender di sini menampung isi dari formUser.gender
    );

    await db.query("COMMIT");
    res.status(201).json({
      success: true,
      message: "Data Akun & Profil Siswa berhasil disimpan!",
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Gagal simpan transaksi siswa:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan data siswa: " + error.message,
    });
  }
});

// =========================================================================
// ENDPOINT KHUSUS DASHBOARD GURU
// =========================================================================

// 1. Ambil Jadwal Mengajar Guru yang Sedang Login
app.get("/api/guru/jadwal/:guru_id", async (req, res) => {
  const { guru_id } = req.params;
  try {
    const queryText = `
      SELECT 
        jp.id AS jadwal_id,
        k.id AS kelas_id,
        k.nama_kelas AS nama_kelas,
        mp.id AS mapel_id,
        mp.nama_mapel,
        jp.hari,
        jp.jam_mulai,
        jp.jam_selesai
      FROM jadwal_pelajaran jp
      JOIN kelas k ON jp.kelas_id = k.id
      JOIN mata_pelajaran mp ON jp.mapel_id = mp.id
      WHERE jp.guru_id = $1
      ORDER BY 
        CASE 
          WHEN hari = 'Senin' THEN 1
          WHEN hari = 'Selasa' THEN 2
          WHEN hari = 'Rabu' THEN 3
          WHEN hari = 'Kamis' THEN 4
          WHEN hari = 'Jumat' THEN 5
          ELSE 6
        END, jp.jam_mulai ASC
    `;
    const result = await db.query(queryText, [guru_id]);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Ambil Daftar Murid Berdasarkan Kelas ID (Untuk Form Absensi Guru)
app.get("/api/guru/siswa-per-kelas/:kelas_id", async (req, res) => {
  const { kelas_id } = req.params;
  try {
    const queryText = `
      SELECT id, nisn, nama_lengkap, jenis_kelamin 
      FROM siswa 
      WHERE kelas_id = $1 
      ORDER BY nama_lengkap ASC
    `;
    const result = await db.query(queryText, [kelas_id]);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint: Melacak Apakah Sesi Jadwal Kelas Ini Sudah Pernah Dikunci Hari Ini
app.get("/api/guru/cek-absensi-hari-ini", async (req, res) => {
  const { jadwal_id } = req.query;
  const tanggalHariIni = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    const query = `
      SELECT siswa_id, status FROM absensi 
      WHERE id_jadwal = $1 AND tanggal = $2
    `;
    const result = await db.query(query, [jadwal_id, tanggalHariIni]);

    if (result.rows.length > 0) {
      // Jika records ditemukan, tandanya kelas sudah sah terabsen sebelumnya
      res.json({ success: true, already_exists: true, data: result.rows });
    } else {
      res.json({ success: true, already_exists: false, data: [] });
    }
  } catch (error) {
    console.error("Gagal melacak rekam history absensi:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.post("/api/guru/absensi", async (req, res) => {
  const { jadwal_id, guru_id, daftar_kehadiran } = req.body;

  const sekarang = new Date();
  const tanggalHariIni = sekarang.toISOString().split("T")[0];

  // 1. Dapatkan nama hari saat ini dalam bahasa Indonesia
  const daftarHari = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  const hariIni = daftarHari[sekarang.getDay()]; // Menghasilkan "Jumat", "Sabtu", dll.

  const jamSekarang = sekarang.getHours();
  const menitSekarang = sekarang.getMinutes();
  const totalMenitSekarang = jamSekarang * 60 + menitSekarang;

  try {
    // 2. Ambil data hari, jam_mulai, dan jam_selesai dari database
    const jadwalQuery = `SELECT hari, jam_mulai, jam_selesai FROM jadwal_pelajaran WHERE id = $1`;
    const jadwalResult = await db.query(jadwalQuery, [jadwal_id]);

    if (jadwalResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Konfigurasi jadwal tidak ditemukan.",
      });
    }

    const { hari, jam_mulai, jam_selesai } = jadwalResult.rows[0];

    // --- PROTEKSI 0: VALIDASI KECOCOKAN HARI ---
    if (hariIni.toLowerCase() !== hari.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak! Hari ini adalah hari ${hariIni}, sedangkan kelas ini dijadwalkan khusus pada hari ${hari}.`,
      });
    }

    // Konversi jam ke menit
    const [jamMulai, menitMulai] = jam_mulai.split(":").map(Number);
    const [jamSelesai, menitSelesai] = jam_selesai.split(":").map(Number);

    const totalMenitMulai = jamMulai * 60 + menitMulai;
    const totalMenitSelesai = jamSelesai * 60 + menitSelesai;

    // --- PROTEKSI 1: VALIDASI ANTI-ABSEN KEPAGIAN ---
    const toleransiMulai = 10;
    if (totalMenitSekarang < totalMenitMulai - toleransiMulai) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak! Sesi absensi belum dibuka. Kelas baru dimulai pukul ${jam_mulai.slice(0, 5)} WIB.`,
      });
    }

    // --- PROTEKSI 2: VALIDASI KUNCI OTOMATIS JIKA KELAS SUDAH SELESAI ---
    const batasTerlambat = 120;
    if (totalMenitSekarang > totalMenitSelesai + batasTerlambat) {
      return res.status(400).json({
        success: false,
        message:
          "Sesi pengisian absensi untuk jadwal kelas ini telah kedaluwarsa dan dikunci oleh sistem sekolah.",
      });
    }

    // PROSES SIMPAN KE DATABASE (JIKA LOLOS VALIDASI HARI & JAM)
    await db.query("BEGIN");

    for (const [siswa_id, statusRaw] of Object.entries(daftar_kehadiran)) {
      const status = statusRaw.toLowerCase();

      const cekQuery = `
        SELECT id FROM absensi 
        WHERE siswa_id = $1 AND id_jadwal = $2 AND tanggal = $3
      `;
      const cekResult = await db.query(cekQuery, [
        siswa_id,
        jadwal_id,
        tanggalHariIni,
      ]);

      if (cekResult.rows.length > 0) {
        const updateQuery = `
          UPDATE absensi SET status = $1 WHERE siswa_id = $2 AND id_jadwal = $3 AND tanggal = $4
        `;
        await db.query(updateQuery, [
          status,
          siswa_id,
          jadwal_id,
          tanggalHariIni,
        ]);
      } else {
        const insertQuery = `
          INSERT INTO absensi (siswa_id, id_jadwal, diabsen_oleh, tanggal, status) VALUES ($1, $2, $3, $4, $5)
        `;
        await db.query(insertQuery, [
          siswa_id,
          jadwal_id,
          guru_id,
          tanggalHariIni,
          status,
        ]);
      }
    }

    await db.query("COMMIT");
    res.status(200).json({
      success: true,
      message:
        "Seluruh data presensi siswa berhasil diverifikasi dan dikunci aman!",
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Gagal mengunci absensi:", error.message);
    res.status(500).json({
      success: false,
      message: "Terjadi gangguan internal pada server database sekolah.",
    });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`Server backend berjalan di port ${PORT}`);
});
