import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import { AudioProvider } from './context/AudioContext';
import { ThemeProvider } from './context/ThemeContext';

// Host components
import { HomeScreen } from './components/host/HomeScreen';
import { PlaylistSelect } from './components/host/PlaylistSelect';
import { AudioDownload } from './components/host/AudioDownload';
import { GameSetup } from './components/host/GameSetup';
import { GameScreen } from './components/host/GameScreen';
import { WinnerVerification } from './components/host/WinnerVerification';
import { RoundEnd } from './components/host/RoundEnd';
import { GameOver } from './components/host/GameOver';
import { ResumeGame } from './components/host/ResumeGame';

// Admin components
import { AdminDashboard } from './components/admin/AdminDashboard';
import { PlaylistEditor } from './components/admin/PlaylistEditor';
import { CardGenerator } from './components/admin/CardGenerator';
import { AudioTester } from './components/admin/AudioTester';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AudioProvider>
          <GameProvider>
            <Routes>
            {/* Host Mode Routes */}
            <Route path="/" element={<HomeScreen />} />
            <Route path="/host/playlists" element={<PlaylistSelect />} />
            <Route path="/host/download/:id" element={<AudioDownload />} />
            <Route path="/host/setup/:id" element={<GameSetup />} />
            <Route path="/host/game" element={<GameScreen />} />
            <Route path="/host/verify" element={<WinnerVerification />} />
            <Route path="/host/round-end" element={<RoundEnd />} />
            <Route path="/host/game-over" element={<GameOver />} />
            <Route path="/host/resume" element={<ResumeGame />} />

            {/* Admin Mode Routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/playlist/:id" element={<PlaylistEditor />} />
            <Route path="/admin/cards/:id" element={<CardGenerator />} />
            <Route path="/admin/audio/:id" element={<AudioTester />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </GameProvider>
        </AudioProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
