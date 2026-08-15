import { getEmailRuntimeConfig, isEmailConfigured } from '../config/email.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Anything a user typed can end up inside these templates, so escape it rather
// than trusting it — an unescaped display name would otherwise let someone
// inject markup into the mail we send in their name.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    throw new Error('Email service is not configured');
  }

  const { apiKey, from } = getEmailRuntimeConfig();

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });

  if (!response.ok) {
    const detail = await response.text();
    // The API key can never appear here — Resend echoes the payload, not the
    // header — but keep the log short so nothing unexpected leaks either.
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 200)}`);
  }

  return await response.json();
}

function layout({ heading, body, buttonLabel, buttonUrl, footer }) {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FAFAF8;padding:32px 16px">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #EAE7E3;border-radius:16px;padding:32px">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#D97757">Try Your Speech</div>
        <h1 style="font-size:20px;color:#1C1917;margin:12px 0 8px">${heading}</h1>
        <p style="font-size:15px;line-height:1.6;color:#57534E;margin:0 0 24px">${body}</p>
        <a href="${buttonUrl}" style="display:inline-block;background:#D97757;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:12px">${buttonLabel}</a>
        <p style="font-size:13px;line-height:1.6;color:#A8A29E;margin:24px 0 0">
          Nếu nút trên không bấm được, hãy sao chép đường dẫn này vào trình duyệt:<br>
          <span style="color:#78716C;word-break:break-all">${buttonUrl}</span>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#A8A29E;margin:16px 0 0">${footer}</p>
      </div>
    </div>
  `;
}

export async function sendVerificationEmail({ to, displayName, token }) {
  const { appUrl } = getEmailRuntimeConfig();
  const url = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;

  return await sendEmail({
    to,
    subject: 'Xác minh email cho Try Your Speech',
    text: `Chào ${displayName}, mở đường dẫn sau để xác minh email: ${url}`,
    html: layout({
      heading: `Chào ${escapeHtml(displayName)},`,
      body: 'Bấm nút bên dưới để xác minh địa chỉ email này và bắt đầu luyện IELTS Speaking.',
      buttonLabel: 'Xác minh email',
      buttonUrl: url,
      footer: 'Đường dẫn có hiệu lực trong 24 giờ. Nếu bạn không đăng ký tài khoản nào, hãy bỏ qua email này.',
    }),
  });
}

export async function sendPasswordResetEmail({ to, displayName, token }) {
  const { appUrl } = getEmailRuntimeConfig();
  const url = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  return await sendEmail({
    to,
    subject: 'Đặt lại mật khẩu Try Your Speech',
    text: `Chào ${displayName}, mở đường dẫn sau để đặt lại mật khẩu: ${url}`,
    html: layout({
      heading: `Chào ${escapeHtml(displayName)},`,
      body: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút bên dưới để đặt mật khẩu mới.',
      buttonLabel: 'Đặt lại mật khẩu',
      buttonUrl: url,
      footer: 'Đường dẫn có hiệu lực trong 1 giờ và chỉ dùng được một lần. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn giữ nguyên.',
    }),
  });
}
