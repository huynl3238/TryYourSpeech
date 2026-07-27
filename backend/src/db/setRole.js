import 'dotenv/config';
import pool from '../config/db.js';

const VALID_ROLES = new Set(['student', 'mentor', 'admin']);

// Grants a role by email — the only way to create the first admin, since roles
// can never be self-selected through the API.
// Usage: node src/db/setRole.js <email> <student|mentor|admin>
async function setRole() {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error('Cách dùng: node src/db/setRole.js <email> <student|mentor|admin>');
    process.exit(1);
  }

  if (!VALID_ROLES.has(role)) {
    console.error(`Role không hợp lệ: ${role}. Chỉ nhận: student, mentor, admin`);
    process.exit(1);
  }

  try {
    const result = await pool.query(
      `
        UPDATE users
        SET user_role = $2
        WHERE LOWER(email) = LOWER($1)
        RETURNING id, display_name, email, user_role
      `,
      [email, role]
    );

    if (result.rowCount === 0) {
      console.error(`Không tìm thấy người dùng có email ${email}.`);
      console.error('Hãy đăng nhập bằng Google một lần trước để tài khoản được tạo.');
      process.exit(1);
    }

    const user = result.rows[0];
    console.log(`Đã cấp quyền "${user.user_role}" cho ${user.display_name} <${user.email}>`);
  } finally {
    await pool.end();
  }
}

setRole().catch((err) => {
  console.error('Cấp quyền thất bại:', err.message);
  process.exit(1);
});
