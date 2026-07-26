import React from 'react';
import './GameOverModal.css';

const GameOverModal = ({ score, isHost, timeLeft, votes, playersCount, players, playerScores, onVote, onLeave, myId }) => {
  const myVote = votes[myId];
  const votedCount = Object.keys(votes).length;

  const handleVoteClick = (voteType) => {
    if (playersCount === 1) {
      if (voteType === 'PLAY_AGAIN') onVote('PLAY_AGAIN');
      else if (voteType === 'TO_LOBBY') onVote('TO_LOBBY');
      else if (voteType === 'LEAVE') onLeave();
      return;
    }
    if (myVote === voteType) {
      onVote(null); // Cancel vote
    } else {
      onVote(voteType); // Cast or change vote
    }
  };

  // Build sorted players list for contribution leaderboard
  const allPlayerIds = Array.from(new Set([
    ...(players || []).map(p => p.id),
    ...Object.keys(playerScores || {})
  ]));

  const sortedPlayers = allPlayerIds.map(id => {
    const p = (players || []).find(pl => pl.id === id);
    return {
      id,
      name: p ? p.name : (id === myId ? '나' : `플레이어 (${id.slice(0, 4)})`),
      score: (playerScores && playerScores[id]) || 0
    };
  }).sort((a, b) => b.score - a.score);

  // Helper to render checkmarks under a button
  const renderCheckmarks = (voteType) => {
    const voters = Object.entries(votes || {})
      .filter(([id, v]) => v === voteType)
      .map(([id]) => id);

    return (
      <div className="checkmarks-container">
        {voters.map(id => {
          const isMe = id === myId;
          const pName = (players || []).find(p => p.id === id)?.name || '플레이어';
          return (
            <div
              key={id}
              className={`checkmark-circle ${isMe ? 'my-checkmark' : 'other-checkmark'}`}
              title={`${pName}${isMe ? ' (나)' : ''}`}
            >
              ✓
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="apple-score-container">
        <div className={`top-section ${playersCount > 1 ? 'multiplayer-layout' : ''}`}>
          <div className="apple-body">
            <div className="score-text">최종 점수</div>
            <div className="score-number">{score}</div>
          </div>

          {playersCount > 1 && (
            <div className="contribution-board">
              <h3 className="contribution-title">🏆 기여 점수</h3>
              <div className="contribution-list">
                {sortedPlayers.map((p, idx) => (
                  <div key={p.id} className={`contribution-row row-${idx % 2}`}>
                    <span className="rank-badge" style={{
                      color: idx === 0 ? '#f1c40f' : idx === 1 ? '#e0e0e0' : idx === 2 ? '#e67e22' : '#95a5a6'
                    }}>
                      {idx + 1}위
                    </span>
                    <span className="player-nick">{p.name}</span>
                    <span className="player-score">{p.score}점</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="buttons-container">
          <div className="timer-badge">
            {playersCount === 1 ? '무엇을 할까요?' : `${timeLeft}초 후 투표가 자동 종료됩니다... (${votedCount}/${playersCount} 투표됨)`}
          </div>

          <div className="voting-buttons-group">
            {/* 다시 하기 버튼 */}
            <div className="button-column">
              <button
                className={`gameover-btn ${myVote === 'PLAY_AGAIN' ? 'btn-voted-grey' : 'btn-play-again'}`}
                onClick={() => handleVoteClick('PLAY_AGAIN')}
              >
                <div>다시 하기</div>
                {myVote === 'PLAY_AGAIN' && <div className="cancel-vote-text">(투표 취소)</div>}
              </button>
              {renderCheckmarks('PLAY_AGAIN')}
            </div>

            {/* 대기실로 버튼 */}
            <div className="button-column">
              <button
                className={`gameover-btn ${myVote === 'TO_LOBBY' ? 'btn-voted-grey' : 'btn-to-lobby'}`}
                onClick={() => handleVoteClick('TO_LOBBY')}
              >
                <div>대기실로</div>
                {myVote === 'TO_LOBBY' && <div className="cancel-vote-text">(투표 취소)</div>}
              </button>
              {renderCheckmarks('TO_LOBBY')}
            </div>

            {/* 나가기 버튼 */}
            <div className="button-column">
              <button
                className={`gameover-btn ${myVote === 'LEAVE' ? 'btn-voted-grey' : 'btn-leave'}`}
                onClick={() => handleVoteClick('LEAVE')}
              >
                <div>나가기</div>
                {myVote === 'LEAVE' && <div className="cancel-vote-text">(투표 취소)</div>}
              </button>
              {renderCheckmarks('LEAVE')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameOverModal;
