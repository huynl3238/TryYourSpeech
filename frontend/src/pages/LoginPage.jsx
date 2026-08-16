import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { AuthCard, AuthField, AuthSubmitButton, FormMessage } from '../components/auth/AuthCard';
import { registerWithPassword, resendVerification } from '../services/api';

const MIN_PASSWORD_LENGTH = 8;

function SignInForm({ onDone }) {
  const { loginWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    setNeedsVerification(false);

    try {
      await loginWithPassword({ email, password });
      onDone();
    } catch (err) {
      setError(err.message);
      // The API flags this case so we can offer to resend the link instead of
      // leaving the person stuck on an error they cannot act on.
      setNeedsVerification(err.message.includes('xác minh email'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setNotice('');
    try {
      const data = await resendVerification(email);
      setNotice(data.message);
      setNeedsVerification(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-left">
      <AuthField
        id="login-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="ban@example.com"
        autoComplete="email"
        required
      />
      <AuthField
        id="login-password"
        label="Mật khẩu"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Mật khẩu của bạn"
        autoComplete="current-password"
        required
      />

      <div className="flex justify-end -mt-1">
        <Link to="/forgot-password" className="text-[12.5px] font-semibold text-[#8A4A33] hover:text-[#D97757]">
          Quên mật khẩu?
        </Link>
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}
      {needsVerification && (
        <button
          type="button"
          onClick={handleResend}
          className="text-[12.5px] font-semibold text-[#8A4A33] underline underline-offset-2 self-start"
        >
          Gửi lại email xác minh
        </button>
      )}
      {notice && <FormMessage tone="success">{notice}</FormMessage>}

      <AuthSubmitButton submitting={submitting}>Đăng nhập</AuthSubmitButton>
    </form>
  );
}

function SignUpForm() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
      return;
    }

    // A typo here would lock the person out of an account they cannot yet log
    // into to fix, so catch it before the account exists.
    if (password !== confirmation) {
      setError('Hai lần nhập mật khẩu không khớp');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await registerWithPassword({ email, password, displayName });
      setSentTo(email);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-[#ECFDF5] text-[#059669] grid place-items-center mx-auto mb-3">
          <span className="material-symbols-rounded" style={{ fontSize: 24 }}>mark_email_read</span>
        </div>
        <h2 className="text-[15px] font-bold text-[#1C1917]">Kiểm tra hộp thư của bạn</h2>
        <p className="text-[13.5px] text-[#78716C] mt-1.5 leading-relaxed">
          Chúng tôi đã gửi một email tới <b className="text-[#1C1917]">{sentTo}</b>. Bấm đường dẫn
          trong email đó để xác minh và bắt đầu luyện tập. Nếu không thấy, hãy kiểm tra mục spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-left">
      <AuthField
        id="signup-name"
        label="Tên hiển thị"
        value={displayName}
        onChange={setDisplayName}
        placeholder="Nguyễn Văn A"
        maxLength={100}
        autoComplete="name"
        required
      />
      <AuthField
        id="signup-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="user@gmail.com"
        autoComplete="email"
        required
      />
      <AuthField
        id="signup-password"
        label="Mật khẩu"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự`}
        autoComplete="new-password"
        required
      />
      <AuthField
        id="signup-password-confirm"
        label="Nhập lại mật khẩu"
        type="password"
        value={confirmation}
        onChange={(value) => { setConfirmation(value); setError(''); }}
        placeholder="Nhập lại mật khẩu vừa tạo"
        autoComplete="new-password"
        required
      />

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <AuthSubmitButton submitting={submitting}>Tạo tài khoản</AuthSubmitButton>
    </form>
  );
}

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('next') || '/';
  const [mode, setMode] = useState('signIn');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  const goHome = () => navigate(redirectTo, { replace: true });

  return (
    <AuthCard
      title={mode === 'signIn' ? 'Đăng nhập Try Your Speech' : 'Tạo tài khoản mới'}
      subtitle={
        mode === 'signIn'
          ? 'Đăng nhập để lưu lịch sử luyện tập và kết quả của bạn.'
          : 'Đăng ký bằng email, hoặc dùng tài khoản Google cho nhanh.'
      }
    >
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F5F3F0] mb-5">
        {[
          { key: 'signIn', label: 'Đăng nhập' },
          { key: 'signUp', label: 'Đăng ký' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMode(tab.key)}
            className={`h-9 rounded-lg text-[13.5px] font-semibold transition-colors ${
              mode === tab.key ? 'bg-white text-[#1C1917] shadow-sm' : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-[#A8A29E] text-center">Đang kiểm tra phiên đăng nhập…</p>
      ) : (
        <>
          {mode === 'signIn' ? <SignInForm onDone={goHome} /> : <SignUpForm />}

          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-[#EAE7E3]" />
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-[#A8A29E]">hoặc</span>
            <span className="flex-1 h-px bg-[#EAE7E3]" />
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton onSignedIn={goHome} />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-6 w-full text-[13px] font-semibold text-[#78716C] hover:text-[#8A4A33]"
      >
        Quay lại trang chính
      </button>
    </AuthCard>
  );
}
