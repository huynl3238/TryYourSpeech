import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import pool from '../config/db.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

async function readSchemaSql() {
  return await readFile(join(currentDir, 'schema.sql'), 'utf8');
}

async function runMigration() {
  const schemaSql = await readSchemaSql();

  try {
    await pool.query(schemaSql);
    console.log('Database migration completed');
  } finally {
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('Database migration failed:', err.message);
  process.exit(1);
});
