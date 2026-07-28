import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard, AuthField, AuthSubmitButton, FormMessage } from '../components/auth/AuthCard';
import { resetPassword } from '../services/api';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
      return;
    }

    if (password !== confirmation) {
      setError('Hai lần nhập mật khẩu không khớp');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Đặt lại mật khẩu">
        <FormMessage>Đường dẫn không hợp lệ. Hãy yêu cầu gửi lại từ trang Quên mật khẩu.</FormMessage>
        <button
          type="button"
          onClick={() => navigate('/forgot-password')}
          className="w-full h-11 mt-4 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105"
        >
          Quên mật khẩu
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đặt mật khẩu mới">
      {done ? (
        <>
          <FormMessage tone="success">
            Đã đổi mật khẩu. Mọi thiết bị đang đăng nhập đều đã bị đăng xuất để đảm bảo an toàn.
          </FormMessage>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full h-11 mt-4 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105"
          >
            Đăng nhập
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-left">
          <AuthField
            id="reset-password"
            label="Mật khẩu mới"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự`}
            autoComplete="new-password"
            required
          />
          <AuthField
            id="reset-confirm"
            label="Nhập lại mật khẩu"
            type="password"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            required
          />
          {error && <FormMessage>{error}</FormMessage>}
          <AuthSubmitButton submitting={submitting}>Đổi mật khẩu</AuthSubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
