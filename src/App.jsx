import React, { useState } from 'react';
import Lobby from './components/Lobby';
import Room from './components/Room';
import './App.css';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || `ws://${window.location.hostname}:8000`;

function App() {
  const [clientName, setClientName] = useState(`Player${Math.floor(Math.random() * 1000)}`);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !inRoom) {
      setRoomId(roomParam);
      setIsHost(false);
      setInRoom(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substr(2, 9);
    setRoomId(newRoomId);
    setIsHost(true);
    setInRoom(true);
  };

  const handleJoinRoom = (id) => {
    const banUntil = localStorage.getItem(`banned_${id}`);
    if (banUntil && Date.now() < parseInt(banUntil, 10)) {
      // Banned, ignore join
      return;
    }
    setRoomId(id);
    setIsHost(false);
    setInRoom(true);
  };

  const handleLeaveRoom = () => {
    setInRoom(false);
    setRoomId('');
    setIsHost(false);
  };

  if (!inRoom) {
    return (
      <Lobby 
        serverUrl={SIGNALING_SERVER_URL}
        clientName={clientName}
        setClientName={setClientName}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <Room 
      roomId={roomId}
      isHost={isHost}
      clientName={clientName}
      serverUrl={SIGNALING_SERVER_URL}
      onLeave={handleLeaveRoom}
    />
  );
}

export default App;
