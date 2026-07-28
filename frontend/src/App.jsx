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
import { NotificationToaster } from './components/ui/NotificationToaster';
import { RequireRole } from './components/RequireRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
      <SessionProvider>
        <NotificationToaster />
        <Routes>
        {/* Everything except the login screen needs an account: practising,
            reviewing and results all belong to a specific person now, and the
            API refuses anonymous calls anyway. */}
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
