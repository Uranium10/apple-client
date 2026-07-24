import React, { useEffect, useRef, useState } from 'react';

const PhysicsApples = ({ newParticles }) => {
  const [particles, setParticles] = useState([]);
  const requestRef = useRef(null);
  const particleRefs = useRef({});
  const stateRef = useRef([]);

  useEffect(() => {
    if (newParticles && newParticles.length > 0) {
      const fresh = newParticles.map(p => ({
        ...p,
        x: 0,
        y: 0,
        rotation: 0
      }));
      
      const combined = [...stateRef.current, ...fresh];
      stateRef.current = combined;
      setParticles(combined); // Trigger React render to create new DOM elements
      
      if (!requestRef.current) {
        requestRef.current = requestAnimationFrame(updatePhysics);
      }
    }
  }, [newParticles]);

  const updatePhysics = () => {
    let active = false;
    const nextState = [];
    
    for (let p of stateRef.current) {
      p.vy += 0.8; // Gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      
      // Keep if still roughly on screen (y goes down)
      if (p.startY + p.y < window.innerHeight + 500) {
        nextState.push(p);
        active = true;
        
        const el = particleRefs.current[p.uid];
        if (el) {
          el.style.transform = `translate(${p.startX + p.x}px, ${p.startY + p.y}px) rotate(${p.rotation}deg)`;
        }
      }
    }
    
    stateRef.current = nextState;
    
    if (active) {
      requestRef.current = requestAnimationFrame(updatePhysics);
    } else {
      requestRef.current = null;
      particleRefs.current = {};
      setParticles([]); // Clear DOM elements when all are off-screen
    }
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100, overflow: 'visible' }}>
      {particles.map(p => (
        <div
          key={p.uid}
          ref={el => particleRefs.current[p.uid] = el}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '38px',
            height: '38px',
            marginLeft: '-19px',
            marginTop: '-19px',
            transform: `translate(${p.startX}px, ${p.startY}px) rotate(0deg)`,
            backgroundImage: "url('/apple.png')",
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '22px',
            fontWeight: 'bold',
            color: 'white',
            fontFamily: '"Pretendard", sans-serif',
            willChange: 'transform'
          }}
        >
          {p.number}
        </div>
      ))}
    </div>
  );
};

export default PhysicsApples;
