import { Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
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
import { NotificationToaster } from './components/ui/NotificationToaster';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <NotificationToaster />
        <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/device-check" element={<DeviceCheckPage />} />
        <Route path="/session" element={<SessionPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/waiting-review" element={<WaitingAIPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/mentor" element={<MentorLearnerPage />} />
        <Route path="/mentor/host" element={<MentorHostPage />} />
        <Route path="/mentor/review" element={<MentorReviewPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </ErrorBoundary>
  );
}

export default App;
