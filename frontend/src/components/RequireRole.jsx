import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Route guard. This is a convenience for the UI only — the real enforcement is
// the matching requireRole() check on the API, since anything client-side can
// be bypassed by editing the page.
export function RequireRole({ roles, children }) {
  const { isLoading, isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#FAFAF8]">
        <p className="text-sm text-[#78716C]">Đang kiểm tra quyền truy cập…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(role)) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#FAFAF8] p-6">
        <div className="w-full max-w-md bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[#FBF0EB] text-[#B5674A] grid place-items-center mx-auto mb-4">
            <span className="material-symbols-rounded" style={{ fontSize: 28 }}>lock</span>
          </div>
          <h1 className="text-lg font-bold text-[#1C1917]">Không có quyền truy cập</h1>
          <p className="text-sm text-[#78716C] mt-1.5">Trang này chỉ dành cho quản trị viên.</p>
          <a href="/" className="inline-block mt-6 h-11 px-6 leading-[44px] rounded-xl bg-[#D97757] text-white font-semibold text-sm hover:brightness-105">
            Về trang chính
          </a>
        </div>
      </div>
    );
  }

  return children;
}
