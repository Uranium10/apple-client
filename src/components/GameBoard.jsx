import { useState, useRef, useEffect, useCallback } from 'react';
import './GameBoard.css';
import PhysicsApples from './PhysicsApples';
import RemoteCursor from './RemoteCursor';

const GameBoard = ({ board, size, onApplesRemoved, sendCursorData, isGameOver, score, timeRemaining, totalTime, myColor = 'red', isSpectator = false, cursorData = {}, getPlayerColor }) => {
  const [localBoard, setLocalBoard] = useState(board);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState(null);
  const [currentSelection, setCurrentSelection] = useState([]);
  const [newParticles, setNewParticles] = useState([]);
  const [boardScale, setBoardScale] = useState(1);
  
  const boardRef = useRef(null);
  const innerScreenRef = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startPosRel = useRef({ x: 0, y: 0 });
  const applePositions = useRef([]);
  const poppedApplesRef = useRef(new Set());
  
  // Throttle cursor sends to 20 FPS (50ms)
  const lastCursorTime = useRef(0);
  const lastCursorState = useRef(false);

  // Sync with remote changes and trigger remote physics
  useEffect(() => {
    if (board.every(a => !a.removed)) {
      poppedApplesRef.current.clear(); // Reset on new game
    }

    const remoteRemovedParticles = [];
    board.forEach(remoteApple => {
      if (remoteApple.removed && !poppedApplesRef.current.has(remoteApple.id)) {
        poppedApplesRef.current.add(remoteApple.id);
        const el = document.querySelector(`.apple[data-id='${remoteApple.id}']`);
        const screenEl = innerScreenRef.current;
        const screenRect = screenEl ? screenEl.getBoundingClientRect() : { left: 0, top: 0 };
        const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
        const angle = Math.random() * (340 - 200) * (Math.PI / 180) + 200 * (Math.PI / 180);
        const velocity = Math.random() * 10 + 15; 
        remoteRemovedParticles.push({
          uid: `${remoteApple.id}-${Date.now()}`,
          number: remoteApple.number,
          startX: rect.left - screenRect.left,
          startY: rect.top - screenRect.top,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          vr: (Math.random() - 0.5) * 15
        });
      }
    });

    if (remoteRemovedParticles.length > 0) {
      setNewParticles(remoteRemovedParticles);
    }
    
    setLocalBoard(board);
  }, [board]);

  useEffect(() => {
    const handleResize = () => {
      if (!innerScreenRef.current) return;
      const cols = size.width || size.cols;
      const rows = size.height || size.rows;
      const boardWidth = cols * 40;
      const boardHeight = rows * 40;
      
      const availableWidth = innerScreenRef.current.clientWidth - 100; // side-panel and padding
      const availableHeight = innerScreenRef.current.clientHeight - 60; // padding
      
      const scaleX = availableWidth / boardWidth;
      const scaleY = availableHeight / boardHeight;
      const newScale = Math.min(1, scaleX, scaleY);
      setBoardScale(newScale);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);

  const handleMouseDown = (e) => {
    if (isGameOver || isSpectator) return;
    setIsDragging(true);
    const rect = boardRef.current.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    const boardRect = boardRef.current.getBoundingClientRect();
    const relX = (x - boardRect.left) / boardScale;
    const relY = (y - boardRect.top) / boardScale;
    
    startPos.current = { x, y };
    startPosRel.current = { x: relX, y: relY };
    setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
    
    // Cache positions for smooth selection checking during mousemove
    const apples = Array.from(boardRef.current.children);
    applePositions.current = apples.map(apple => {
      const bRect = apple.getBoundingClientRect();
      return {
        id: parseInt(apple.dataset.id),
        number: parseInt(apple.dataset.number),
        removed: apple.classList.contains('removed'),
        centerX: bRect.left + bRect.width / 2,
        centerY: bRect.top + bRect.height / 2
      };
    });
    
    if (sendCursorData) {
      sendCursorData({ x: relX, y: relY, isDragging: true, rect: { startX: relX, startY: relY, endX: relX, endY: relY } });
    }
  };

  const handleMouseMove = (e) => {
    if (isGameOver) return;
    
    if (sendCursorData) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const relX = (e.clientX - boardRect.left) / boardScale;
      const relY = (e.clientY - boardRect.top) / boardScale;
      
      const rectData = isDragging ? { 
        startX: startPosRel.current.x, startY: startPosRel.current.y, 
        endX: relX, endY: relY 
      } : null;
      
      const now = Date.now();
      const stateChanged = isDragging !== lastCursorState.current;
      
      if (stateChanged || now - lastCursorTime.current > 50) {
        sendCursorData({ x: relX, y: relY, isDragging, rect: rectData });
        lastCursorTime.current = now;
        lastCursorState.current = isDragging;
      }
    }

    if (!isDragging) return;
    
    setSelectionRect(prev => ({
      ...prev,
      endX: e.clientX,
      endY: e.clientY
    }));

    // Calculate current selection
    const minX = Math.min(startPos.current.x, e.clientX);
    const maxX = Math.max(startPos.current.x, e.clientX);
    const minY = Math.min(startPos.current.y, e.clientY);
    const maxY = Math.max(startPos.current.y, e.clientY);

    const selected = [];
    applePositions.current.forEach(pos => {
      if (pos.removed) return;
      if (pos.centerX >= minX && pos.centerX <= maxX && pos.centerY >= minY && pos.centerY <= maxY) {
        selected.push(pos.id);
      }
    });
    setCurrentSelection(selected);
  };

  const handleMouseUp = (e) => {
    if (!isDragging || isGameOver) return;
    setIsDragging(false);
    
    if (sendCursorData) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const relX = (e.clientX - boardRect.left) / boardScale;
      const relY = (e.clientY - boardRect.top) / boardScale;
      sendCursorData({ x: relX, y: relY, isDragging: false, rect: null });
      lastCursorState.current = false;
    }

    let sum = 0;
    currentSelection.forEach(id => {
      const pos = applePositions.current.find(p => p.id === id);
      if (pos) sum += pos.number;
    });

    if (sum === 10) {
      // Valid selection
      const removedParticles = [];
      const screenEl = innerScreenRef.current;
      const screenRect = screenEl ? screenEl.getBoundingClientRect() : { left: 0, top: 0 };
      const newBoard = localBoard.map(apple => {
        if (currentSelection.includes(apple.id)) {
          if (!poppedApplesRef.current.has(apple.id)) {
            poppedApplesRef.current.add(apple.id);
            const el = document.querySelector(`.apple[data-id='${apple.id}']`);
            const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
            const angle = Math.random() * (340 - 200) * (Math.PI / 180) + 200 * (Math.PI / 180);
            const velocity = Math.random() * 10 + 15; 
            removedParticles.push({
              uid: `${apple.id}-${Date.now()}`,
              number: apple.number,
              startX: rect.left - screenRect.left,
              startY: rect.top - screenRect.top,
              vx: Math.cos(angle) * velocity,
              vy: Math.sin(angle) * velocity,
              vr: (Math.random() - 0.5) * 15
            });
          }
          return { ...apple, removed: true };
        }
        return apple;
      });
      setLocalBoard(newBoard);
      if (removedParticles.length > 0) {
        setNewParticles(removedParticles);
      }
      const points = currentSelection.length;
      if (onApplesRemoved) onApplesRemoved(currentSelection, points);
    }
    
    setSelectionRect(null);
    setCurrentSelection([]);
  };

  const percentage = Math.max(0, (timeRemaining / totalTime) * 100);

  return (
    <div 
      className="game-inner-screen" 
      ref={innerScreenRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="game-board-container">
        <div 
          className="game-board" 
          ref={boardRef}
          style={{
            gridTemplateColumns: `repeat(${size.width || size.cols}, 40px)`,
            transform: `scale(${boardScale})`,
            transformOrigin: 'center center'
          }}
        >
          {localBoard.map(apple => {
            const isSelected = currentSelection.includes(apple.id);
            return (
              <div
                key={apple.id}
                data-id={apple.id}
                data-number={apple.number}
                className={`apple ${apple.removed ? 'removed' : ''} ${isSelected ? 'selected' : ''}`}
                style={{
                  boxShadow: isSelected ? `0 0 10px ${myColor}, inset 0 0 10px ${myColor}` : 'none',
                  transform: isSelected ? 'scale(0.9)' : 'scale(1)',
                  transition: 'all 0.1s ease-in-out',
                  borderColor: isSelected ? myColor : 'transparent',
                  backgroundColor: isSelected ? `${myColor}33` : undefined
                }}
              >
                {apple.number}
              </div>
            );
          })}
          
          <RemoteCursor cursorData={cursorData} getPlayerColor={getPlayerColor} />
        </div>
        
        {isDragging && selectionRect && !isSpectator && (
          <div 
            className="selection-box"
            style={{
              left: Math.min(selectionRect.startX, selectionRect.endX),
              top: Math.min(selectionRect.startY, selectionRect.endY),
              width: Math.abs(selectionRect.endX - selectionRect.startX),
              height: Math.abs(selectionRect.endY - selectionRect.startY),
              backgroundColor: `${myColor}33`,
              border: `2px solid ${myColor}`
            }}
          />
        )}
      </div>

      <div className="side-panel">
        <div className="score-display">{score}</div>
        <div className="timer-track">
          <div className="timer-fill" style={{ height: `${percentage}%` }}></div>
        </div>
      </div>
      <PhysicsApples newParticles={newParticles} />
    </div>
  );
};

export default GameBoard;
