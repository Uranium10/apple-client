import React, { useState, useEffect } from 'react';

const RemoteCursor = ({ cursorDataRef, getPlayerColor }) => {
  const [localCursorData, setLocalCursorData] = useState({});

  useEffect(() => {
    // 50ms interval = 20 fps
    const interval = setInterval(() => {
      if (cursorDataRef && cursorDataRef.current) {
        setLocalCursorData({ ...cursorDataRef.current });
      }
    }, 50);
    return () => clearInterval(interval);
  }, [cursorDataRef]);

  if (!localCursorData) return null;

  return (
    <>
      {Object.entries(localCursorData).map(([peerId, data]) => {
        const { x, y, isDragging, rect } = data;
        const color = getPlayerColor ? getPlayerColor(peerId) : 'red';
        
        return (
          <React.Fragment key={peerId}>
            <div
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 15,
                height: 15,
                backgroundColor: color,
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 9999,
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 5px rgba(0,0,0,0.5)',
              }}
            />
            {isDragging && rect && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(rect.startX, rect.endX),
                  top: Math.min(rect.startY, rect.endY),
                  width: Math.abs(rect.endX - rect.startX),
                  height: Math.abs(rect.endY - rect.startY),
                  backgroundColor: 'transparent',
                  border: `2px dashed ${color}`,
                  boxShadow: `inset 0 0 10px ${color}33`,
                  pointerEvents: 'none',
                  zIndex: 9998,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default RemoteCursor;
