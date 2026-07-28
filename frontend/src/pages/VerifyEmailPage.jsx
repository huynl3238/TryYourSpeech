import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthCard, FormMessage } from '../components/auth/AuthCard';

// Landing page for the link in the verification email. Confirming also signs the
// person in, so they go straight to practising instead of typing the password
// they just chose.
export default function VerifyEmailPage() {
  const { verifyEmailToken } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying');
  const [error, setError] = useState('');
  // React 18 StrictMode mounts effects twice in development; the token is
  // single-use, so a second call would always fail.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setStatus('error');
      setError('Đường dẫn xác minh không hợp lệ.');
      return;
    }

    verifyEmailToken(token)
      .then(() => setStatus('done'))
      .catch((err) => {
        setStatus('error');
        setError(err.message);
      });
  }, [token, verifyEmailToken]);

  useEffect(() => {
    if (status !== 'done') return undefined;

    const timer = setTimeout(() => navigate('/', { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [status, navigate]);

  return (
    <AuthCard title="Xác minh email">
      {status === 'verifying' && (
        <p className="text-sm text-[#78716C] text-center">Đang xác minh đường dẫn của bạn…</p>
      )}

      {status === 'done' && (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-[#ECFDF5] text-[#059669] grid place-items-center mx-auto mb-3">
            <span className="material-symbols-rounded" style={{ fontSize: 24 }}>check</span>
          </div>
          <p className="text-sm text-[#57534E]">Xác minh thành công. Đang đưa bạn vào ứng dụng…</p>
        </div>
      )}

      {status === 'error' && (
        <>
          <FormMessage>{error}</FormMessage>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full h-11 mt-4 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105"
          >
            Về trang đăng nhập
          </button>
        </>
      )}
    </AuthCard>
  );
}
