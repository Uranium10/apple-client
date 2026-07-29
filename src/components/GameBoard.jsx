import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import './GameBoard.css';
import PhysicsApples from './PhysicsApples';
import RemoteCursor from './RemoteCursor';

const Apple = memo(({ id, number, removed, isSelected, myColor }) => (
  <div
    data-id={id}
    data-number={number}
    className={`apple ${removed ? 'removed' : ''} ${isSelected ? 'selected' : ''}`}
    style={isSelected ? {
      boxShadow: `0 0 10px ${myColor}, inset 0 0 10px ${myColor}`,
      transform: 'scale(0.9)',
      borderColor: myColor,
      backgroundColor: `${myColor}33`
    } : undefined}
  >
    {number}
  </div>
));

const GameBoard = ({ board, size, onApplesRemoved, sendCursorData, isGameOver, score, timeRemaining, totalTime, myColor = 'red', isSpectator = false, cursorDataRef, getPlayerColor }) => {
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
  const isInitialMountRef = useRef(true);
  
  // Throttle cursor sends to 20 FPS (50ms)
  const lastCursorTime = useRef(0);
  const lastCursorState = useRef(false);

  // Sync with remote changes and trigger remote physics
  useEffect(() => {
    if (board.every(a => !a.removed)) {
      poppedApplesRef.current.clear(); // Reset on new game
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      board.forEach(a => {
        if (a.removed) {
          poppedApplesRef.current.add(a.id);
        }
      });
      setLocalBoard(board);
      return;
    }

    const remoteRemovedParticles = [];
    const newRemovedApples = board.filter(remoteApple => remoteApple.removed && !poppedApplesRef.current.has(remoteApple.id));
    
    if (newRemovedApples.length > 0) {
      const cols = size.width || size.cols;
      newRemovedApples.forEach(remoteApple => {
        poppedApplesRef.current.add(remoteApple.id);
        
        const col = remoteApple.id % cols;
        const row = Math.floor(remoteApple.id / cols);
        // Position relative to game-board (unscaled)
        const startX = col * 40 + 20;
        const startY = row * 40 + 20;

        const angle = Math.random() * (340 - 200) * (Math.PI / 180) + 200 * (Math.PI / 180);
        const velocity = Math.random() * 10 + 15; 
        remoteRemovedParticles.push({
          uid: `${remoteApple.id}-${Date.now()}`,
          number: remoteApple.number,
          startX: startX,
          startY: startY,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          vr: (Math.random() - 0.5) * 15
        });
      });
    }

    if (remoteRemovedParticles.length > 0) {
      setNewParticles(remoteRemovedParticles);
    }
    
    setLocalBoard(board);
  }, [board, size]);

  const getBoardCoords = (e, boardRect, scale) => {
    const isRotated = window.innerWidth <= 950 && window.innerHeight > window.innerWidth;
    if (isRotated) {
      return {
        relX: (boardRect.bottom - e.clientY) / scale,
        relY: (e.clientX - boardRect.left) / scale
      };
    } else {
      return {
        relX: (e.clientX - boardRect.left) / scale,
        relY: (e.clientY - boardRect.top) / scale
      };
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (!innerScreenRef.current) return;
      const cols = size.width || size.cols;
      const rows = size.height || size.rows;
      const boardWidth = cols * 40;
      const boardHeight = rows * 40;
      
      const isMobile = window.innerWidth <= 950 || window.innerHeight <= 600;
      const widthPadding = isMobile ? 20 : 100;
      const heightPadding = isMobile ? 20 : 60;
      
      const availableWidth = innerScreenRef.current.clientWidth - widthPadding;
      const availableHeight = innerScreenRef.current.clientHeight - heightPadding;
      
      const scaleX = availableWidth / boardWidth;
      const scaleY = availableHeight / boardHeight;
      let newScale = Math.min(1, scaleX, scaleY);
      if (isMobile) {
        newScale *= 0.88; // Slightly reduce scale on mobile so apples never touch screen edges or address bars
      }
      setBoardScale(newScale);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);

  const handleMouseDown = (e) => {
    if (isGameOver || isSpectator || !boardRef.current) return;
    setIsDragging(true);
    
    const boardRect = boardRef.current.getBoundingClientRect();
    const { relX, relY } = getBoardCoords(e, boardRect, boardScale);
    
    startPosRel.current = { x: relX, y: relY };
    setSelectionRect({ startX: relX, startY: relY, endX: relX, endY: relY });
    
    // Cache positions in unscaled board coordinates (0..680, 0..400) for rotation-safe selection
    const cols = size.width || size.cols;
    const apples = Array.from(boardRef.current.children).filter(child => child.classList.contains('apple'));
    applePositions.current = apples.map(apple => {
      const id = parseInt(apple.dataset.id);
      const col = id % cols;
      const row = Math.floor(id / cols);
      return {
        id: id,
        number: parseInt(apple.dataset.number),
        removed: apple.classList.contains('removed'),
        centerX: col * 40 + 20,
        centerY: row * 40 + 20
      };
    });
    
    if (sendCursorData) {
      sendCursorData({ x: relX, y: relY, isDragging: true, rect: { startX: relX, startY: relY, endX: relX, endY: relY } });
    }
  };

  const handleMouseMove = (e) => {
    if (isGameOver || !boardRef.current) return;
    
    const boardRect = boardRef.current.getBoundingClientRect();
    const { relX, relY } = getBoardCoords(e, boardRect, boardScale);

    if (sendCursorData) {
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
    
    setSelectionRect(prev => prev ? ({
      ...prev,
      endX: relX,
      endY: relY
    }) : null);

    // Calculate current selection in unscaled board coordinates
    const minX = Math.min(startPosRel.current.x, relX);
    const maxX = Math.max(startPosRel.current.x, relX);
    const minY = Math.min(startPosRel.current.y, relY);
    const maxY = Math.max(startPosRel.current.y, relY);

    // Expand hit box tolerance by 5px (25% of the 20px cell radius) for balanced hit detection.
    // Computing these 4 boundaries once outside the loop ensures 0% performance overhead!
    const hitMinX = minX - 5;
    const hitMaxX = maxX + 5;
    const hitMinY = minY - 5;
    const hitMaxY = maxY + 5;

    const selected = [];
    applePositions.current.forEach(pos => {
      if (pos.removed) return;
      if (pos.centerX >= hitMinX && pos.centerX <= hitMaxX && pos.centerY >= hitMinY && pos.centerY <= hitMaxY) {
        selected.push(pos.id);
      }
    });
    setCurrentSelection(selected);
  };

  const handleMouseUp = (e) => {
    if (!isDragging || isGameOver) return;
    setIsDragging(false);
    
    if (sendCursorData && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const { relX, relY } = getBoardCoords(e, boardRect, boardScale);
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
      const cols = size.width || size.cols;

      const newBoard = localBoard.map(apple => {
        if (currentSelection.includes(apple.id)) {
          if (!poppedApplesRef.current.has(apple.id)) {
            poppedApplesRef.current.add(apple.id);
            
            const col = apple.id % cols;
            const row = Math.floor(apple.id / cols);
            // Position relative to game-board (unscaled)
            const startX = col * 40 + 20;
            const startY = row * 40 + 20;

            const angle = Math.random() * (340 - 200) * (Math.PI / 180) + 200 * (Math.PI / 180);
            const velocity = Math.random() * 10 + 15; 
            removedParticles.push({
              uid: `${apple.id}-${Date.now()}`,
              number: apple.number,
              startX: startX,
              startY: startY,
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
  const isDanger = timeRemaining <= 10 && timeRemaining > 0;
  const selectionSet = useMemo(() => new Set(currentSelection), [currentSelection]);

  const cols = size.width || size.cols;
  const rows = size.height || size.rows;
  const boardWidth = cols * 40;
  const boardHeight = rows * 40;

  return (
    <div 
      className={`game-inner-screen ${isDanger ? 'danger-mode' : ''}`}
      ref={innerScreenRef}
      onPointerDown={(e) => {
        e.target.setPointerCapture(e.pointerId);
        handleMouseDown(e);
      }}
      onPointerMove={handleMouseMove}
      onPointerUp={(e) => {
        try { e.target.releasePointerCapture(e.pointerId); } catch(err) {}
        handleMouseUp(e);
      }}
      onPointerCancel={(e) => {
        try { e.target.releasePointerCapture(e.pointerId); } catch(err) {}
        handleMouseUp(e);
      }}
    >
      <div className="game-board-container">
        <div style={{ width: boardWidth * boardScale, height: boardHeight * boardScale }}>
          <div 
            className="game-board" 
            ref={boardRef}
            style={{
              gridTemplateColumns: `repeat(${cols}, 40px)`,
              transform: `scale(${boardScale})`,
              transformOrigin: 'top left',
              position: 'relative'
            }}
          >
            {localBoard.map(apple => (
              <Apple
                key={apple.id}
                id={apple.id}
                number={apple.number}
                removed={apple.removed}
                isSelected={selectionSet.has(apple.id)}
                myColor={myColor}
              />
            ))}
            
            <RemoteCursor cursorDataRef={cursorDataRef} getPlayerColor={getPlayerColor} />
            <PhysicsApples newParticles={newParticles} />
            {isDragging && selectionRect && !isSpectator && (
              <div 
                className="selection-box"
                style={{
                  position: 'absolute',
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
        </div>
      </div>
      <div className="side-panel">
        <div className="score-display">{score}</div>
        <div className="timer-track">
          <div className="timer-fill" style={{ '--timer-pct': percentage / 100 }}></div>
        </div>
      </div>
    </div>
  );
};

export default GameBoard;
