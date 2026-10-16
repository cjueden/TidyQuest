import React, { useMemo } from 'react';
import type { Season } from '../../utils/seasons';

interface ConfettiEffectProps {
  show: boolean;
  /** During a holiday, half the pieces are its shapes (bats, leaves, snowflakes) in its colors */
  season?: Season | null;
}

const COLORS = ['#F97316', '#FBBF24', '#FB923C', '#FCD34D', '#F59E0B', '#EA580C'];

const keyframesStyle = `
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}`;

const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ show, season }) => {
  const colors = season?.confetti.colors ?? COLORS;
  const pieces = useMemo(
    () =>
      Array.from({ length: 45 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.2 + Math.random() * 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        emoji: season && i % 2 === 0 ? season.confetti.emoji[Math.floor(i / 2) % season.confetti.emoji.length] : null,
        size: 5 + Math.random() * 8,
        rotation: Math.random() * 360,
      })),
    [show, season, colors],
  );

  if (!show) return null;

  return (
    <div className="tq-confetti" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
      <style>{keyframesStyle}</style>
      {pieces.map((p) => p.emoji ? (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: -24,
            fontSize: p.size * 1.8,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        >
          {p.emoji}
        </span>
      ) : (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: -12,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.size > 9 ? '50%' : '2px',
            transform: `rotate(${p.rotation}deg)`,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
};

export { ConfettiEffect };
export default ConfettiEffect;
