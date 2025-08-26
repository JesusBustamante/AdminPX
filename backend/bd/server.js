// backend/bd/server.js (ESM)
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga el .env ubicado en /backend/.env
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('dotenv path ->', envPath, 'loaded');
} else {
  console.log('dotenv path ->', envPath, 'exists? false');
}

const cfg = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  // ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
};

console.log('PG cfg ->', { ...cfg, password: '***' });

const pool = new Pool(cfg);

// Probar conexión
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conexión a PostgreSQL OK');
  } catch (e) {
    console.error('❌ No se pudo conectar a PostgreSQL:', e.message);
  }
})();

pool.on('error', (err) => console.error('Error en el pool PG:', err));

export const query = (text, params) => pool.query(text, params);
export { pool };
