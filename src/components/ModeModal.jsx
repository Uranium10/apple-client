import React from 'react';
import './ModeModal.css';

const ModeModal = ({ onClose, onSelectMode }) => {
  return (
    <div className="mode-modal-overlay">
      <div className="mode-modal-content">
        <button className="mode-close-btn" onClick={onClose}>&times;</button>
        
        <div className="mode-top-row">
          <div className="mode-card mode-coop" onClick={() => onSelectMode('coop')}>
            <h3>협동 게임</h3>
          </div>
          <div className="mode-card mode-comp" onClick={() => onSelectMode('comp')}>
            <h3>경쟁 게임</h3>
          </div>
        </div>
        
        <div className="mode-bottom-row">
          <div className="mode-card mode-solo" onClick={() => onSelectMode('solo')}>
            <h3>혼자 하기</h3>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default ModeModal;
