import React, { useMemo, memo } from 'react';
import './OpponentsBoard.css';

// Separate, memoized component for each opponent's mini board
// It will only re-render if boardStructure or removedIds array REFERENCE changes
const MiniBoard = memo(({ boardStructure, removedIds }) => {
  // Convert array to Set for O(1) lookups instead of O(N) array includes
  const removedSet = useMemo(() => new Set(removedIds), [removedIds]);

  return (
    <div className="mini-board">
      {boardStructure.map((appleId) => {
        const isRemoved = removedSet.has(appleId);
        return (
          <div 
            key={appleId} 
            className={`mini-apple ${isRemoved ? 'removed' : ''}`}
            style={{ backgroundColor: isRemoved ? 'transparent' : '#ff4757' }}
          />
        );
      })}
    </div>
  );
});

// Memoize the entire OpponentsBoard to avoid re-rendering when the local game state (like timeRemaining) changes
const OpponentsBoard = memo(({ players, opponentsState, initialBoard, isSpectator, onSpectatePlayer, spectatingId }) => {
  
  // Cache the board structure (array of just the IDs) so we don't depend on initialBoard.board changing
  const boardStructure = useMemo(() => {
    if (!initialBoard || !initialBoard.board) return [];
    return initialBoard.board.map(a => a.id);
  }, [initialBoard?.board?.length]);

  const opponents = useMemo(() => {
    return players
      .filter(p => opponentsState[p.id] !== undefined)
      .map(p => {
        const state = opponentsState[p.id];
        return {
          id: p.id,
          name: p.name,
          score: state.score,
          removedIds: state.removedIds
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [players, opponentsState]);

  if (opponents.length === 0) return null;

  return (
    <div className="opponents-board-container">
      <h3>경쟁 현황</h3>
      <div className="opponents-list">
        {opponents.map((opp, index) => (
          <div 
            key={opp.id} 
            className={`opponent-card ${isSpectator && spectatingId === opp.id ? 'spectating-active' : ''}`}
            style={{ 
              transform: `translateY(${index * 130}px)`,
              cursor: isSpectator ? 'pointer' : 'default',
              border: isSpectator && spectatingId === opp.id ? '2px solid #00bfff' : 'none'
            }}
            onClick={() => {
              if (isSpectator && onSpectatePlayer) {
                onSpectatePlayer(opp.id);
              }
            }}
          >
            <div className="opponent-header">
              <span className="opponent-rank">{index + 1}위</span>
              <span className="opponent-name">{opp.name}</span>
              <span className="opponent-score">{opp.score}점</span>
            </div>
            
            <MiniBoard boardStructure={boardStructure} removedIds={opp.removedIds} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default OpponentsBoard;
