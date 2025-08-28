// bd/server.js (ESM)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

// Cargar .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

// BD #1: Formularios
const cfg1 = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
};
// BD #2: Control OP
const cfg2 = {
  host: process.env.PG2HOST,
  port: Number(process.env.PG2PORT || 5432),
  user: process.env.PG2USER,
  password: process.env.PG2PASSWORD,
  database: process.env.PG2DATABASE,
};

const pool1 = new Pool(cfg1);
const pool2 = new Pool(cfg2);

pool1.on('error', (err) => console.error('PG-1 pool error:', err));
pool2.on('error', (err) => console.error('PG-2 pool error:', err));

// Prueba conexiones al arrancar
(async () => {
  try { await pool1.query('SELECT 1'); console.log('✅ PG-1 OK'); }
  catch (e) { console.error('❌ PG-1 FAIL:', e.message); }
  try { await pool2.query('SELECT 1'); console.log('✅ PG-2 OK'); }
  catch (e) { console.error('❌ PG-2 FAIL:', e.message); }
})();

// ✅ Exports nombrados
export const query  = (sql, p) => pool1.query(sql, p);
export const query2 = (sql, p) => pool2.query(sql, p);

