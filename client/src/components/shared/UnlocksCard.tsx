import { useEffect, useState } from 'react';
import { api, type UnlocksView } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import type { User } from '../../hooks/useAuth';
import { BADGE_FRAME_EMOJI, type Celebration } from '../../utils/unlocks';
import { UserAvatar } from './UserAvatar';
import { ConfettiEffect } from './ConfettiEffect';

const CELEBRATIONS: Celebration[] = ['confetti', 'coins', 'fireworks'];
const label = { fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)' } as const;
const option = (on: boolean, locked: boolean) => ({
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, padding: '8px 6px', borderRadius: 12, minWidth: 64,
  fontFamily: 'Nunito', fontSize: 11, fontWeight: 800, color: 'var(--warm-text)', background: 'none',
  border: `2px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer',
});
const lock = { fontSize: 10, color: 'var(--warm-text-light)' } as const;

/** Profile: pick your avatar frame, celebration and title from what your level has unlocked. */
export function UnlocksCard({ user, onChanged }: { user: User; onChanged?: () => void }) {
  const { t } = useTranslation(user.language);
  const [view, setView] = useState<UnlocksView | null>(null);
  const [trying, setTrying] = useState<Celebration | null>(null);
  useEffect(() => { api.getUnlocks().then(setView).catch(() => setView(null)); }, []);
  if (!view) return null;

  const save = async (data: Parameters<typeof api.updateUnlocks>[0]) => {
    setView(await api.updateUnlocks(data));
    onChanged?.();
  };
  const levelOf = (kind: string, id: string) => view.items.find((i) => i.kind === kind && i.id === id)!;
  const frames = view.items.filter((i) => i.kind === 'frame');
  const lockText = (level: number) => `🔒 ${t('levels.level').replace('{n}', String(level))}`;
  const avatar = { name: user.displayName, color: user.avatarColor, size: 40, avatarType: user.avatarType, avatarPreset: user.avatarPreset, avatarPhotoUrl: user.avatarPhotoUrl };
  const try_ = (c: Celebration) => { setTrying(c); window.setTimeout(() => setTrying(null), 2600); };

  return (
    <div className="tq-card tq-card-padded" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <ConfettiEffect show={trying !== null} celebration={trying ?? 'confetti'} />
      <div>
        <h3 className="tq-card-title" style={{ margin: 0 }}>🔓 {t('unlocks.title')} · {t('levels.level').replace('{n}', String(view.level))}</h3>
        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('unlocks.desc')}</div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <span style={label}>{t('unlocks.frame')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={option(view.chosen.frame === null, false)} onClick={() => void save({ frame: null })}>
            <UserAvatar {...avatar} frame={null} />{t('unlocks.none')}
          </button>
          {frames.map((f) => (
            <button key={f.id} type="button" disabled={!f.unlocked} style={option(view.chosen.frame === f.id, !f.unlocked)} onClick={() => void save({ frame: f.id })}>
              <UserAvatar {...avatar} frame={f.id} />
              {t(`unlocks.frameName_${f.id}`)}
              {!f.unlocked && <span style={lock}>{lockText(f.level)}</span>}
            </button>
          ))}
          {/* Badge frames appear once earned; the rest are one hint below */}
          {view.badgeFrames.filter((f) => f.unlocked).map((f) => (
            <button key={f.id} type="button" style={option(view.chosen.frame === f.id, false)} onClick={() => void save({ frame: f.id })}
              title={t('unlocks.badgeFrame').replace('{badge}', t(f.titleKey))}>
              <UserAvatar {...avatar} frame={f.id} frameIcon={f.icon} />
              {BADGE_FRAME_EMOJI[f.icon]} {t(f.titleKey)}
            </button>
          ))}
        </div>
        {view.badgeFrames.some((f) => !f.unlocked) && <span style={{ ...lock, fontSize: 11 }}>{t('unlocks.badgeHint')}</span>}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <span style={label}>{t('unlocks.celebration')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {CELEBRATIONS.map((c) => {
            const needs = c === 'confetti' ? null : levelOf('celebration', c);
            const locked = !!needs && !needs.unlocked;
            return (
              <button key={c} type="button" disabled={locked} style={option(view.chosen.celebration === c, locked)} onClick={() => { void save({ celebration: c }); try_(c); }}>
                <span style={{ fontSize: 20 }}>{c === 'confetti' ? '🎊' : c === 'coins' ? '🪙' : '🎆'}</span>
                {t(`unlocks.celebrationName_${c}`)}
                {locked && <span style={lock}>{lockText(needs!.level)}</span>}
              </button>
            );
          })}
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => try_((view.chosen.celebration as Celebration) ?? 'confetti')}>{t('unlocks.tryIt')}</button>
        </div>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={label}>{t('unlocks.titleLabel')}</span>
        {view.level < view.titleLevel ? (
          <span style={{ ...lock, fontSize: 12 }}>{lockText(view.titleLevel)}</span>
        ) : (
          <select className="tq-input-compact" value={view.chosen.title ?? ''} onChange={(e) => void save({ title: e.target.value || null })}>
            <option value="">{t('unlocks.none')}</option>
            {view.titles.map((o) => (
              <option key={o.id} value={o.id}>{o.id === 'level' ? t('unlocks.levelTitle') : o.titleKey ? t(o.titleKey) : o.text}</option>
            ))}
          </select>
        )}
      </label>
    </div>
  );
}
