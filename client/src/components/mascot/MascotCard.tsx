import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';
import { Bed, CREATURES, DustBunnies, Egg, OVERLAYS, type CreatureId, type MascotMood, type OverlayId } from './MascotArt';

export interface MascotData {
  creature: CreatureId;
  name: string;
  stage: 'egg' | 'baby' | 'kid' | 'grown' | 'legendary';
  familyCoins: number;
  nextStage: { stage: string; at: number } | null;
  mood: MascotMood;
  houseHealth: number;
  messiestRoom: { id: number; name: string } | null;
  event: 'rescue' | 'birthday' | 'teamGoal' | null;
  birthdayName: string | null;
}

const SCALE: Record<string, number> = { baby: 0.72, kid: 0.86, grown: 1, legendary: 1 };
const COSTUMES: Record<string, OverlayId> = { witch: 'witchHat', pilgrim: 'pilgrimHat', santa: 'santaHat' };
const STAGE_ORDER = ['egg', 'baby', 'kid', 'grown', 'legendary'];

/** The creature itself: grows by stage, wears what it has unlocked, a costume or a party hat */
export function MascotPicture({ m, costume, size = 112 }: { m: Pick<MascotData, 'creature' | 'stage' | 'mood' | 'event'>; costume?: string | null; size?: number }) {
  const c = CREATURES[m.creature] ?? CREATURES.dog;
  const grown = STAGE_ORDER.indexOf(m.stage);
  const messy = m.mood === 'messy' || m.mood === 'sad';
  // One thing on its head: party hat > holiday costume > crown > top hat > messy hair
  const head: OverlayId | null = m.event === 'birthday' ? 'partyHat'
    : costume && COSTUMES[costume] ? COSTUMES[costume]
    : m.stage === 'legendary' ? 'crown'
    : m.stage === 'grown' ? 'hat'
    : messy ? 'messyHair' : null;
  const Head = head ? OVERLAYS[head] : null;
  const s = SCALE[m.stage] ?? 1;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-hidden="true"
      style={{ overflow: 'visible', filter: m.stage === 'legendary' ? 'drop-shadow(0 0 8px #FBBF24AA)' : undefined }}>
      {m.stage === 'egg' ? <Egg creature={m.creature} /> : (
        <g transform={`translate(60 112) scale(${s}) translate(-60 -112)`}>
          {grown >= 1 && <Bed />}
          <c.Art mood={m.mood} />
          {grown >= 2 && <OVERLAYS.scarf a={c.anchors} />}
          {Head && <Head a={c.anchors} />}
        </g>
      )}
      {messy && m.stage !== 'egg' && <DustBunnies />}
    </svg>
  );
}

/** Home: the family's mascot, how it feels, what it needs, and how close it is to growing */
export function MascotCard({ m, costume, language }: { m: MascotData; costume?: string | null; language?: string }) {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const say = m.event === 'birthday' ? t('mascot.birthday').replace('{name}', m.birthdayName ?? '')
    : m.event === 'teamGoal' ? t('mascot.teamGoal')
    : m.event === 'rescue' ? t('mascot.rescue')
    : m.stage === 'egg' ? t('mascot.egg')
    : m.messiestRoom ? t('mascot.help').replace('{room}', m.messiestRoom.name)
    : t(`mascot.mood_${m.mood}`);
  const motion = m.event ? 'mascot-party' : m.mood === 'happy' ? 'mascot-bounce' : m.mood === 'sad' ? 'mascot-droop' : 'mascot-sway';
  const pct = m.nextStage ? Math.min(100, Math.round((m.familyCoins / m.nextStage.at) * 100)) : 100;
  return (
    <div className="tq-card tq-card-padded mascot-card" style={{ gridColumn: '1 / -1', display: 'flex', gap: 14, alignItems: 'center' }}>
      <div className={motion} style={{ position: 'relative', flexShrink: 0 }}>
        <MascotPicture m={m} costume={costume} />
        {m.event && <span className="mascot-confetti" aria-hidden="true">🎉</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
        <div className="mascot-bubble" style={{ position: 'relative', padding: '8px 12px', borderRadius: 14, background: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>
          {say}
          {!m.event && m.messiestRoom && (
            <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" style={{ display: 'block', marginTop: 6 }} onClick={() => navigate(`/rooms/${m.messiestRoom!.id}`)}>
              {t('mascot.goHelp')}
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--warm-text)' }}>
          {m.name} <span style={{ fontWeight: 700, color: 'var(--warm-text-muted)' }}>· {t(`mascot.stage_${m.stage}`)}</span>
        </div>
        {m.nextStage ? (
          <div style={{ display: 'grid', gap: 3 }}>
            <span style={{ height: 6, borderRadius: 99, background: 'var(--health-bar-track)', overflow: 'hidden', display: 'block' }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--warm-accent)' }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>
              {t('mascot.grows').replace('{stage}', t(`mascot.stage_${m.nextStage.stage}`)).replace('{n}', formatCoins(m.nextStage.at - m.familyCoins))}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('mascot.maxed')}</span>
        )}
      </div>
    </div>
  );
}
