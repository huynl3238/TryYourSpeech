import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard, AuthField, AuthSubmitButton, FormMessage } from '../components/auth/AuthCard';
import { forgotPassword } from '../services/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const data = await forgotPassword(email);
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle="Nhập email của bạn, chúng tôi sẽ gửi đường dẫn đặt lại mật khẩu."
    >
      {message ? (
        <FormMessage tone="success">{message}</FormMessage>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-left">
          <AuthField
            id="forgot-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="ban@example.com"
            autoComplete="email"
            hint="Nếu bạn đăng nhập bằng Google, hãy quay lại và bấm nút Google. Tài khoản đó không có mật khẩu."
            required
          />
          {error && <FormMessage>{error}</FormMessage>}
          <AuthSubmitButton submitting={submitting}>Gửi đường dẫn đặt lại</AuthSubmitButton>
        </form>
      )}

      <button
        type="button"
        onClick={() => navigate('/login')}
        className="mt-6 w-full text-[13px] font-semibold text-[#78716C] hover:text-[#8A4A33]"
      >
        Về trang đăng nhập
      </button>
    </AuthCard>
  );
}
