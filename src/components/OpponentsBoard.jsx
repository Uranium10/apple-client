import React, { useMemo } from 'react';
import './OpponentsBoard.css';

const OpponentsBoard = ({ players, myId, opponentsState, initialBoard }) => {
  const opponents = useMemo(() => {
    return players
      .filter(p => p.id !== myId)
      .map(p => {
        const state = opponentsState[p.id] || { score: 0, removedIds: [] };
        return {
          id: p.id,
          name: p.name,
          score: state.score,
          removedIds: state.removedIds
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [players, myId, opponentsState]);

  if (opponents.length === 0) return null;

  return (
    <div className="opponents-board-container">
      <h3>경쟁 현황</h3>
      <div className="opponents-list">
        {opponents.map((opp, index) => (
          <div 
            key={opp.id} 
            className="opponent-card"
            style={{ transform: `translateY(${index * 130}px)` }}
          >
            <div className="opponent-header">
              <span className="opponent-rank">{index + 1}위</span>
              <span className="opponent-name">{opp.name}</span>
              <span className="opponent-score">{opp.score}점</span>
            </div>
            
            <div className="mini-board">
              {initialBoard && initialBoard.board && initialBoard.board.map((apple, i) => {
                const isRemoved = opp.removedIds.includes(apple.id);
                return (
                  <div 
                    key={apple.id} 
                    className={`mini-apple ${isRemoved ? 'removed' : ''}`}
                    style={{ backgroundColor: isRemoved ? 'transparent' : '#ff4757' }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OpponentsBoard;
