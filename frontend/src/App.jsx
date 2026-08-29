import { Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { AuthProvider } from './context/AuthContext';
import LobbyPage from './pages/LobbyPage';
import DeviceCheckPage from './pages/DeviceCheckPage';
import SessionPage from './pages/SessionPage';
import ReviewPage from './pages/ReviewPage';
import WaitingAIPage from './pages/WaitingAIPage';
import ResultsPage from './pages/ResultsPage';
import MentorHostPage from './pages/MentorHostPage';
import MentorLearnerPage from './pages/MentorLearnerPage';
import MentorReviewPage from './pages/MentorReviewPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import LoginPage from './pages/LoginPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { NotificationToaster } from './components/ui/NotificationToaster';
import { PartnerReconnectingBanner } from './components/PartnerReconnectingBanner';
import { RequireRole } from './components/RequireRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SessionProvider>
          <NotificationToaster />
          <PartnerReconnectingBanner />
          <Routes>
            <Route path="/" element={<RequireRole><LobbyPage /></RequireRole>} />
            <Route path="/device-check" element={<RequireRole><DeviceCheckPage /></RequireRole>} />
            <Route path="/session" element={<RequireRole><SessionPage /></RequireRole>} />
            <Route path="/review" element={<RequireRole><ReviewPage /></RequireRole>} />
            <Route path="/waiting-review" element={<RequireRole><WaitingAIPage /></RequireRole>} />
            <Route path="/results" element={<RequireRole><ResultsPage /></RequireRole>} />
            <Route path="/mentor" element={<RequireRole><MentorLearnerPage /></RequireRole>} />
            <Route path="/mentor/host" element={<RequireRole roles={['mentor', 'admin']}><MentorHostPage /></RequireRole>} />
            <Route path="/mentor/review" element={<RequireRole><MentorReviewPage /></RequireRole>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/admin"
              element={(
                <RequireRole roles={['admin']}>
                  <AdminDashboardPage />
                </RequireRole>
              )}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
