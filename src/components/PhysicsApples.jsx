import React, { useEffect, useRef, useMemo } from 'react';

const POOL_SIZE = 40;

const PhysicsApples = ({ newParticles }) => {
  const requestRef = useRef(null);
  const particleRefs = useRef([]);
  // activeParticles stores the physics state of currently animating particles
  const activeParticlesRef = useRef([]);

  // Initialize pool structure
  const pool = useMemo(() => Array.from({ length: POOL_SIZE }).map((_, i) => ({ id: i })), []);

  useEffect(() => {
    if (newParticles && newParticles.length > 0) {
      // Find available DOM elements in the pool
      const newActive = [...activeParticlesRef.current];
      
      const fresh = newParticles.map(p => {
        // Find a free slot in the pool (a slot not currently in newActive)
        let poolIndex = -1;
        for (let i = 0; i < POOL_SIZE; i++) {
          if (!newActive.some(ap => ap.poolIndex === i)) {
            poolIndex = i;
            break;
          }
        }
        
        // If pool is full, just overwrite a random one
        if (poolIndex === -1) poolIndex = Math.floor(Math.random() * POOL_SIZE);

        const newParticle = {
          ...p,
          x: 0,
          y: 0,
          rotation: 0,
          poolIndex
        };
        newActive.push(newParticle);

        const el = particleRefs.current[poolIndex];
        if (el) {
          el.style.opacity = 1;
          el.innerText = p.number;
          el.style.transform = `translate(${p.startX}px, ${p.startY}px) rotate(0deg)`;
        }

        return newParticle;
      });
      
      activeParticlesRef.current = newActive;
      
      if (!requestRef.current) {
        requestRef.current = requestAnimationFrame(updatePhysics);
      }
    }
  }, [newParticles]);

  const updatePhysics = () => {
    let active = false;
    const nextState = [];
    
    for (let p of activeParticlesRef.current) {
      p.vy += 0.8; // Gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      
      const el = particleRefs.current[p.poolIndex];
      
      // Keep if still roughly on screen (y goes down)
      if (p.startY + p.y < window.innerHeight + 500) {
        nextState.push(p);
        active = true;
        
        if (el) {
          el.style.transform = `translate(${p.startX + p.x}px, ${p.startY + p.y}px) rotate(${p.rotation}deg)`;
        }
      } else {
        // Mark as free by hiding
        if (el) {
          el.style.opacity = 0;
        }
      }
    }
    
    activeParticlesRef.current = nextState;
    
    if (active) {
      requestRef.current = requestAnimationFrame(updatePhysics);
    } else {
      requestRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100, overflow: 'visible' }}>
      {pool.map((p, i) => (
        <div
          key={p.id}
          ref={el => particleRefs.current[i] = el}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '38px',
            height: '38px',
            marginLeft: '-19px',
            marginTop: '-19px',
            opacity: 0, // Hidden initially
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
        />
      ))}
    </div>
  );
};

export default PhysicsApples;
