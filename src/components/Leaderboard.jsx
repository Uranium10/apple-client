import React, { useState, useEffect, useRef } from 'react';
import './Leaderboard.css';

const Leaderboard = ({ serverUrl, isOpen, onClose, onUpdate }) => {
  const [leaderboardData, setLeaderboardData] = useState({
    '1p': [],
    '2p': [],
    '3p': [],
    '4p': []
  });
  const [activeTab, setActiveTab] = useState('1p');
  const isFirstMessage = useRef(true);
  
  useEffect(() => {
    // SSE connection
    const eventSource = new EventSource(`${serverUrl}/api/leaderboard/stream`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLeaderboardData(data);
        if (!isFirstMessage.current && onUpdate) {
          onUpdate();
        }
        isFirstMessage.current = false;
      } catch (err) {
        console.error("Error parsing leaderboard data", err);
      }
    };
    
    return () => {
      eventSource.close();
    };
  }, [serverUrl]);

  return (
    <div className={`leaderboard-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="leaderboard-header">
        <h2>순위표</h2>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>
      
      <div className="leaderboard-tabs">
        {['1p', '2p', '3p', '4p'].map(tab => (
          <button 
            key={tab} 
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0)}인
          </button>
        ))}
      </div>
      
      <div className="leaderboard-content">
        {leaderboardData[activeTab]?.length > 0 ? (
          <ul className="leaderboard-list">
            {leaderboardData[activeTab].map((entry, index) => (
              <li key={index} className="leaderboard-item">
                <div className="rank-badge">{index + 1}</div>
                <div className="player-names-container">
                  <span className="player-names" title={entry.playerNames}>{entry.playerNames}</span>
                </div>
                <div className="score-badge">{entry.score}점</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">기록이 없습니다.</div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
