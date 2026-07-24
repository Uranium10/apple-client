import React from 'react';
import './HeaderInfo.css';

const HeaderInfo = ({ score, timeRemaining, totalTime }) => {
  const percentage = (timeRemaining / totalTime) * 100;
  
  // Choose color based on remaining time (green -> yellow -> red)
  let barColor = '#32cd32'; // limegreen
  if (percentage < 30) {
    barColor = '#ff4500'; // orange red
  } else if (percentage < 60) {
    barColor = '#ffd700'; // gold
  }

  return (
    <div className="header-info-container">
      <div className="score-display">
        <span className="score-label">Score:</span>
        <span className="score-value">{score}</span>
      </div>
      
      <div className="timer-container">
        <div className="timer-bar-bg">
          <div 
            className="timer-bar-fill" 
            style={{ 
              width: `${percentage}%`,
              backgroundColor: barColor 
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default HeaderInfo;
