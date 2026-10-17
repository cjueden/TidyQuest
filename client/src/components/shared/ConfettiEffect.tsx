import React, { useMemo } from 'react';
import type { Season } from '../../utils/seasons';
import type { Celebration } from '../../utils/unlocks';

interface ConfettiEffectProps {
  show: boolean;
  /** During a holiday, half the pieces are its shapes (bats, leaves, snowflakes) in its colors */
  season?: Season | null;
  /** The person's celebration style (Unlockables): confetti, falling coins (level 3) or fireworks (level 8) */
  celebration?: Celebration;
}

const COLORS = ['#F97316', '#FBBF24', '#FB923C', '#FCD34D', '#F59E0B', '#EA580C'];

const keyframesStyle = `
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
@keyframes fireworkBurst {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.4); opacity: 0; }
}`;

const GOLD = ['#F59E0B', '#FBBF24', '#FCD34D', '#D97706'];
const COIN_SHAPES = ['🪙'];
const BURST_SPOTS = [[25, 28], [72, 22], [48, 45], [80, 52]];
const FIREWORK_COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7', '#EC4899'];

const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ show, season, celebration = 'confetti' }) => {
  const coins = celebration === 'coins';
  const colors = coins ? GOLD : season?.confetti.colors ?? COLORS;
  const shapes = coins ? COIN_SHAPES : season?.confetti.emoji;
  const pieces = useMemo(
    () =>
      Array.from({ length: 45 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.2 + Math.random() * 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        emoji: shapes && i % 2 === 0 ? shapes[Math.floor(i / 2) % shapes.length] : null,
        size: 5 + Math.random() * 8,
        rotation: Math.random() * 360,
      })),
    [show, shapes, colors],
  );
  // Fireworks: four bursts of sparks, one after another, at set spots
  const bursts = useMemo(
    () => BURST_SPOTS.map(([x, y], b) => ({
      x, y, delay: b * 0.35,
      sparks: Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 80 + (i % 3) * 18;
        const palette = season?.confetti.colors ?? FIREWORK_COLORS;
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, color: palette[(b + i) % palette.length] };
      }),
    })),
    [season],
  );

  if (!show) return null;
  if (celebration === 'fireworks') {
    return (
      <div className="tq-confetti" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
        <style>{keyframesStyle}</style>
        {bursts.map((b, n) => b.sparks.map((sp, i) => (
          <span key={`${n}-${i}`} style={{
            position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: 7, height: 7, borderRadius: '50%', backgroundColor: sp.color,
            boxShadow: `0 0 6px ${sp.color}`, opacity: 0, ['--dx' as string]: `${sp.dx}px`, ['--dy' as string]: `${sp.dy}px`,
            animation: `fireworkBurst 1.1s ease-out ${b.delay}s forwards`,
          }} />
        )))}
      </div>
    );
  }

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
