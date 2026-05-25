import { Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import LobbyPage from './pages/LobbyPage';
import DeviceCheckPage from './pages/DeviceCheckPage';
import SessionPage from './pages/SessionPage';
import ReviewPage from './pages/ReviewPage';
import WaitingAIPage from './pages/WaitingAIPage';
import ResultsPage from './pages/ResultsPage';
import './index.css';

function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/device-check" element={<DeviceCheckPage />} />
        <Route path="/session" element={<SessionPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/waiting-review" element={<WaitingAIPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}

export default App;
