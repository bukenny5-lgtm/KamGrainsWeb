import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function query(text, params = []) {
  try {
    console.log("\n========== SQL ==========");
    console.log(text);
    console.log("PARAMS:", params);
    console.log("=========================\n");

    return await pool.query(text, params);
  } catch (error) {
    console.error("Database query failed:");
    console.error(error.message);
    console.error("SQL:");
    console.error(text);
    console.error("PARAMS:", params);
    throw error;
  }
}

export async function testConnection() {
  const result = await query(
    "SELECT current_database() AS database_name, now() AS server_time;"
  );

  return result.rows[0];
}