import React from 'react';
import './GameOverModal.css';

const GameOverModal = ({ score, isHost, timeLeft, votes, playersCount, onVote, onLeave, myId }) => {
  const myVote = votes[myId];
  const votedCount = Object.keys(votes).length;

  return (
    <div className="modal-overlay">
      <div className="apple-score-container">
        <div className="apple-body">
          <div className="score-text">최종 점수</div>
          <div className="score-number">{score}</div>
        </div>
        
        <div className="buttons-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.6)', 
            padding: '8px 16px', 
            borderRadius: '20px',
            color: 'white', 
            fontWeight: 'bold', 
            fontSize: '18px', 
            marginBottom: '15px',
            display: 'inline-block',
            alignSelf: 'center'
          }}>
            {playersCount === 1 ? '무엇을 할까요?' : `${timeLeft}초 후 투표가 자동 종료됩니다...`}
          </div>
          
          {myVote ? (
            <div style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.6)', 
              padding: '12px 20px', 
              borderRadius: '20px',
              color: 'white', 
              fontWeight: 'bold',
              display: 'inline-block',
              alignSelf: 'center'
            }}>
              <div>나의 선택: {myVote === 'PLAY_AGAIN' ? '다시 하기' : '대기실로'}</div>
              <div style={{ marginTop: '5px' }}>
                다른 플레이어들의 결정을 기다리는 중... ({votedCount}/{playersCount} 완료)
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="green-button" onClick={() => onVote('PLAY_AGAIN')}>
                다시 하기
              </button>
              <button className="green-button" style={{ backgroundColor: '#fd7e14' }} onClick={() => onVote('TO_LOBBY')}>
                대기실로
              </button>
              <button className="green-button" style={{ backgroundColor: '#dc3545' }} onClick={onLeave}>
                나가기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameOverModal;
