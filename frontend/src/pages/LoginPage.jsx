import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('next') || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  return (
    <div className="min-h-screen grid place-items-center bg-[#FAFAF8] p-6">
      <div className="w-full max-w-md bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F7ECE6] text-[#D97757] grid place-items-center mx-auto mb-4">
          <span className="material-symbols-rounded" style={{ fontSize: 30 }}>record_voice_over</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[#1C1917]">Đăng nhập Try Your Speech</h1>
        <p className="text-sm text-[#78716C] mt-1.5 mb-6">
          Dùng tài khoản Google để lưu lịch sử luyện tập và kết quả của bạn.
        </p>

        {isLoading ? (
          <p className="text-sm text-[#A8A29E]">Đang kiểm tra phiên đăng nhập…</p>
        ) : (
          <div className="flex justify-center">
            <GoogleSignInButton onSignedIn={() => navigate(redirectTo, { replace: true })} />
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 text-[13px] font-semibold text-[#78716C] hover:text-[#8A4A33]"
        >
          Quay lại trang chính
        </button>
      </div>
    </div>
  );
}
