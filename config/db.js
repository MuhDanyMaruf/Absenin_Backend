const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("Database terhubung sukses ke Supabase global!");
});

pool.on("error", (err) => {
  console.error("Ada masalah koneksi database:", err.message);
});

module.exports = pool;
