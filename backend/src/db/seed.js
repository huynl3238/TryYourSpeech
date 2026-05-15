import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import pool from '../config/db.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

async function readSeedSql() {
  return await readFile(join(currentDir, 'seed.sql'), 'utf8');
}

async function runSeed() {
  const seedSql = await readSeedSql();

  try {
    await pool.query(seedSql);
    console.log('Database seed completed');
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('Database seed failed:', err.message);
  process.exit(1);
});
