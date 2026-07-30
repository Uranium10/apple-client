import React, { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import Room from './components/Room';
import Leaderboard from './components/Leaderboard';
import ModeModal from './components/ModeModal';
import './App.css';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || `http://${window.location.hostname}:8000`;

const getWebSocketUrl = (url) => {
  let wsUrl = url;
  if (wsUrl.startsWith('http://')) wsUrl = wsUrl.replace('http://', 'ws://');
  else if (wsUrl.startsWith('https://')) wsUrl = wsUrl.replace('https://', 'wss://');
  else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    // No protocol provided
    wsUrl = window.location.protocol === 'https:' ? `wss://${wsUrl}` : `ws://${wsUrl}`;
  }
  
  // Force wss if we are on a secure context (Vercel) but the url is somehow ws://
  if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://') && !wsUrl.includes('localhost') && !wsUrl.includes('127.0.0.1')) {
    wsUrl = wsUrl.replace('ws://', 'wss://');
  }
  
  return wsUrl;
};

function App() {
  const [clientName, setClientName] = useState(() => localStorage.getItem('clientName') || '');
  const [clientId] = useState(() => {
    let id = localStorage.getItem('clientId');
    if (!id) {
      id = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('clientId', id);
    }
    return id;
  });
  
  const [showNameModal, setShowNameModal] = useState(!localStorage.getItem('clientName'));
  const [tempName, setTempName] = useState('');
  
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  
  const [showModeModal, setShowModeModal] = useState(false);
  const [gameMode, setGameMode] = useState('coop'); // coop, comp, solo
  
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [hasNewLeaderboardData, setHasNewLeaderboardData] = useState(false);

  const [isDeactivated, setIsDeactivated] = useState(false);
  const [isGameRunning, setIsGameRunning] = useState(false);

  // 1. Assert dominance on mount
  useEffect(() => {
    const channel = new BroadcastChannel('apple_game_channel');
    
    // Announce to other tabs that this new tab is taking over
    channel.postMessage({ type: 'NEW_TAB_OPENED' });

    const handleMessage = (event) => {
      if (event.data.type === 'NEW_TAB_OPENED') {
        setIsDeactivated(true);
        setInRoom(false);
        setRoomId('');
      }
    };
    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // 2. Handle URL invite link joining
  useEffect(() => {
    if (isDeactivated) return;

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam && !showNameModal && !inRoom) {
      setRoomId(roomParam);
      setIsHost(false);
      setInRoom(true);
      setShowModeModal(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showNameModal, inRoom, isDeactivated]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (tempName.trim()) {
      const name = tempName.trim();
      setClientName(name);
      localStorage.setItem('clientName', name);
      setShowNameModal(false);
    }
  };

  const handleCreateRoom = () => {
    setShowModeModal(true);
  };

  const handleModeSelect = (mode) => {
    setGameMode(mode);
    setShowModeModal(false);
    
    const newRoomId = mode === 'solo' ? 'solo-' + Math.random().toString(36).substr(2, 9) : Math.random().toString(36).substr(2, 9);
    setRoomId(newRoomId);
    setIsHost(true);
    setInRoom(true);
  };

  const handleJoinRoom = (id) => {
    const banUntil = localStorage.getItem(`banned_${id}`);
    if (banUntil && Date.now() < parseInt(banUntil, 10)) {
      alert("이 방에서 강퇴당했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setRoomId(id);
    setIsHost(false);
    setGameMode('coop'); // Default to coop, will sync from host
    setInRoom(true);
    setShowModeModal(false);
  };

  const handleLeaveRoom = () => {
    setInRoom(false);
    setRoomId('');
    setIsHost(false);
  };

  if (isDeactivated) {
    return (
      <div className="name-modal-overlay">
        <div className="name-modal" style={{ textAlign: 'center' }}>
          <h2>다른 창에서 게임이 실행되었습니다</h2>
          <p>새로운 탭에서 사과게임이 열려 이 창은 비활성화되었습니다.</p>
          <p style={{ fontSize: '14px', color: '#666', marginTop: '20px' }}>이 창은 닫으셔도 좋습니다.</p>
        </div>
      </div>
    );
  }

  if (showNameModal) {
    return (
      <div className="name-modal-overlay">
        <div className="name-modal">
          <h2>사과게임에 오신 것을 환영합니다!</h2>
          <p>사용하실 닉네임을 입력해주세요.</p>
          <form onSubmit={handleNameSubmit}>
            <input 
              type="text" 
              placeholder="닉네임 (최대 10자)" 
              maxLength={10}
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={!tempName.trim()}>시작하기</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${isGameRunning ? 'game-active' : ''}`}>
      <button 
        className="leaderboard-toggle-btn"
        onClick={() => {
          setIsLeaderboardOpen(true);
          setHasNewLeaderboardData(false);
        }}
        title="순위표"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 20V10"></path>
          <path d="M12 20V4"></path>
          <path d="M6 20v-6"></path>
        </svg>
        {hasNewLeaderboardData && <span className="notification-dot">!</span>}
      </button>

      <Leaderboard 
        serverUrl={SIGNALING_SERVER_URL} 
        isOpen={isLeaderboardOpen} 
        onClose={() => setIsLeaderboardOpen(false)} 
        onUpdate={() => {
          if (!isLeaderboardOpen) {
            setHasNewLeaderboardData(true);
          }
        }}
      />
      
      {showModeModal && (
        <ModeModal 
          onClose={() => setShowModeModal(false)} 
          onSelectMode={handleModeSelect} 
        />
      )}

      {!inRoom ? (
        <Lobby 
          serverUrl={getWebSocketUrl(SIGNALING_SERVER_URL)}
          clientName={clientName}
          setClientName={(name) => {
            setClientName(name);
            localStorage.setItem('clientName', name);
          }}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      ) : (
        <Room 
          key={roomId}
          roomId={roomId}
          isHost={isHost}
          clientName={clientName}
          serverUrl={getWebSocketUrl(SIGNALING_SERVER_URL)}
          apiServerUrl={SIGNALING_SERVER_URL}
          gameMode={gameMode}
          setGameMode={setGameMode}
          onLeave={handleLeaveRoom}
          onGameStateChange={setIsGameRunning}
        />
      )}
    </div>
  );
}

export default App;
