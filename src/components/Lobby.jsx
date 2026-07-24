import React, { useState, useEffect, useRef } from 'react';
import './Lobby.css';

const Lobby = ({ serverUrl, clientName, setClientName, onCreateRoom, onJoinRoom }) => {
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempName, setTempName] = useState(clientName);
  const [joinRoomId, setJoinRoomId] = useState('');
  
  const ws = useRef(null);
  const clientId = useRef(Math.random().toString(36).substr(2, 9));
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Connect to lobby
    const url = `${serverUrl}/ws/lobby/${clientId.current}?name=${encodeURIComponent(clientName)}`;
    ws.current = new WebSocket(url);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'lobby-chat') {
        setMessages(prev => [...prev, data]);
      } else if (data.type === 'room-info') {
        setOnlineUsers(data.players);
      } else if (data.type === 'player-joined') {
        setOnlineUsers(prev => [...prev, { id: data.clientId, name: data.clientName }]);
        setMessages(prev => [...prev, { type: 'system', text: `${data.clientName}님이 로비에 입장했습니다.` }]);
      } else if (data.type === 'player-left') {
        setOnlineUsers(prev => prev.filter(p => p.id !== data.clientId));
      } else if (data.type === 'profile-updated') {
        setOnlineUsers(prev => prev.map(p => p.id === data.clientId ? { ...p, name: data.clientName } : p));
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []); // Reconnect not needed on name change, name change is sent via ws message

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !ws.current) return;
    
    const msg = { type: 'lobby-chat', text: chatInput };
    ws.current.send(JSON.stringify(msg));
    
    // 낙관적 업데이트 (내 채팅 바로 띄우기)
    setMessages(prev => [...prev, { type: 'lobby-chat', senderId: clientId.current, senderName: clientName, text: chatInput }]);
    setChatInput('');
  };

  const handleSaveProfile = () => {
    if (tempName.trim()) {
      setClientName(tempName.trim());
      setIsEditingProfile(false);
      if (ws.current) {
        ws.current.send(JSON.stringify({ type: 'update-profile', name: tempName.trim() }));
      }
    }
  };

  const handleJoin = () => {
    let code = joinRoomId.trim();
    if (!code) return;
    
    try {
      if (code.includes('http://') || code.includes('https://')) {
        const url = new URL(code);
        const urlParams = new URLSearchParams(url.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
          code = roomParam;
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    onJoinRoom(code);
  };

  return (
    <div className="lobby-container">
      <div className="lobby-box">
        <div className="lobby-header">
          <h1>사과게임 대기실</h1>
        </div>
        
        <div className="lobby-main">
          <div className="chat-section">
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.type === 'system' ? 'system-msg' : (msg.senderId === clientId.current ? 'my-msg' : 'other-msg')}`}>
                  {msg.type === 'system' ? (
                    <span>{msg.text}</span>
                  ) : (
                    <>
                      <span className="sender-name">{msg.senderName}</span>
                      <span className="message-text">{msg.text}</span>
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input-area" onSubmit={handleSendMessage}>
              <input 
                type="text" 
                placeholder="메시지를 입력하세요..." 
                value={chatInput} 
                onChange={e => setChatInput(e.target.value)}
              />
              <button type="submit">전송</button>
            </form>
          </div>

          <div className="right-panel">
            <div className="online-users">
              <h3>접속자 목록 ({onlineUsers.length + 1}명)</h3>
              <ul>
                <li className="me">{clientName} (나)</li>
                {onlineUsers.map(user => (
                  <li key={user.id}>{user.name}</li>
                ))}
              </ul>
            </div>
            
            <div className="profile-section">
              {isEditingProfile ? (
                <div className="profile-edit">
                  <input 
                    type="text" 
                    value={tempName} 
                    onChange={e => setTempName(e.target.value)}
                    maxLength={10}
                  />
                  <button onClick={handleSaveProfile}>저장</button>
                </div>
              ) : (
                <div className="profile-view">
                  <span>👤 {clientName}</span>
                  <button onClick={() => setIsEditingProfile(true)}>이름 변경</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lobby-footer">
          <div className="room-actions">
            <button className="create-btn" onClick={onCreateRoom}>+ 방 만들기</button>
            <div className="join-action">
              <input 
                type="text" 
                placeholder="방 코드 또는 링크 입력" 
                value={joinRoomId} 
                onChange={e => setJoinRoomId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleJoin();
                  }
                }}
              />
              <button className="join-btn" onClick={handleJoin}>참가하기</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
