import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import pool from '../config/db.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

// Hai phần tách hẳn nhau vì chỉ một phần được phép chạy trên server thật:
//   questions.sql — bộ đề chuẩn, là dữ liệu thật của sản phẩm.
//   seed.sql      — tài khoản và phiên minh hoạ, chỉ để xem giao diện lúc dev.
//                   Đổ vào production là bịa ra người dùng và bài nói không có
//                   thật, rồi chúng nằm lẫn trong thống kê.
// `npm run db:seed:questions` nạp riêng phần đầu — đó là lệnh dùng trên server.
// Thứ tự cố định: seed.sql trỏ vào các câu hỏi do questions.sql tạo ra.
const QUESTIONS_ONLY = process.argv.includes('--questions-only');
const SQL_FILES = QUESTIONS_ONLY ? ['questions.sql'] : ['questions.sql', 'seed.sql'];

async function runSeed() {
  try {
    for (const fileName of SQL_FILES) {
      const sql = await readFile(join(currentDir, fileName), 'utf8');
      await pool.query(sql);
      console.log(`Seeded ${fileName}`);
    }

    console.log('Database seed completed');
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('Database seed failed:', err.message);
  process.exit(1);
});
