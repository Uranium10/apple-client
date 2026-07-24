import React, { useEffect, useState, useRef } from 'react';

const PhysicsApples = ({ newParticles }) => {
  const [particles, setParticles] = useState([]);
  const particlesRef = useRef([]);
  const requestRef = useRef();

  useEffect(() => {
    if (newParticles && newParticles.length > 0) {
      // Initialize physics state for new particles
      const fresh = newParticles.map(p => ({
        ...p,
        x: 0,
        y: 0,
        rotation: 0
      }));
      particlesRef.current = [...particlesRef.current, ...fresh];
    }
  }, [newParticles]);

  useEffect(() => {
    const updatePhysics = () => {
      if (particlesRef.current.length > 0) {
        const nextParticles = [];
        for (let p of particlesRef.current) {
          p.vy += 0.8; // 중력 (Gravity coefficient)
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.vr;
          
          // 화면 아래로 완전히 사라질 때까지 유지
          if (p.startY + p.y < window.innerHeight + 200) {
            nextParticles.push(p);
          }
        }
        particlesRef.current = nextParticles;
        setParticles([...nextParticles]);
      } else if (particles.length > 0) {
        setParticles([]);
      }
      
      requestRef.current = requestAnimationFrame(updatePhysics);
    };
    
    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  if (particles.length === 0) return null;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10000, overflow: 'hidden', borderRadius: '15px' }}>
      {particles.map(p => (
        <div
          key={p.uid}
          className="apple physics-particle"
          style={{
            position: 'absolute',
            left: p.startX,
            top: p.startY,
            transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`,
            margin: 0
          }}
        >
          {p.number}
        </div>
      ))}
    </div>
  );
};

export default PhysicsApples;
