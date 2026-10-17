import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { TaskIcon } from '../icons/TaskIcons';
import { ICON_GROUPS } from '../icons/iconGroups';
import { CoinIcon } from '../icons/UIIcons';

/**
 * A chore's icon: shows the current one, and opens a sheet with a live preview of the chore card,
 * the icon its name suggests, a search box and every icon grouped by area.
 */
export function IconPicker({ value, onChange, taskName = '', roomName = '', roomColor, coins, language, compact = false }: {
  value: string;
  onChange: (iconKey: string) => void;
  /** For the preview and the suggestion */
  taskName?: string;
  roomName?: string;
  roomColor?: string;
  coins?: number | null;
  language?: string;
  /** Smaller button (the room-setup list) */
  compact?: boolean;
}) {
  const { t } = useTranslation(language);
  const [open, setOpen] = useState(false);
  const label = (k: string) => t(`taskIcons.${k}`);
  return (
    <>
      <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setOpen(true)} aria-label={t('iconPicker.change')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: compact ? '4px 8px' : '6px 10px', maxWidth: '100%' }}>
        <TaskIcon iconKey={value} size={compact ? 18 : 22} />
        <span style={{ fontSize: compact ? 11 : 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(value)}</span>
      </button>
      {open && (
        <IconSheet value={value} taskName={taskName} roomName={roomName} roomColor={roomColor} coins={coins} language={language}
          onPick={(k) => onChange(k)} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function IconSheet({ value, onPick, onClose, taskName, roomName, roomColor, coins, language }: {
  value: string; onPick: (k: string) => void; onClose: () => void; taskName: string; roomName: string; roomColor?: string; coins?: number | null; language?: string;
}) {
  const { t } = useTranslation(language);
  const [query, setQuery] = useState('');
  const [suggested, setSuggested] = useState<string | null>(null);
  const label = (k: string) => t(`taskIcons.${k}`);

  // The icon the chore's name suggests (the same guess the server makes for a new chore)
  useEffect(() => {
    if (!taskName.trim()) return;
    const timer = window.setTimeout(() => {
      api.suggestIcon(taskName).then((r) => setSuggested(r.iconKey !== 'sparkle' ? r.iconKey : null)).catch(() => setSuggested(null));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [taskName]);

  // Search matches icon names (and keys); a group's name only when no icon matches ("pets" → the Pets group)
  const q = query.trim().toLowerCase();
  const byIcon = ICON_GROUPS.map((g) => ({ ...g, keys: q ? g.keys.filter((k) => `${label(k)} ${k}`.toLowerCase().includes(q)) : g.keys }))
    .filter((g) => g.keys.length > 0);
  const groups = byIcon.length > 0 ? byIcon : ICON_GROUPS.filter((g) => t(`iconGroups.${g.id}`).toLowerCase().includes(q));

  const cell = (k: string) => (
    <button key={k} type="button" onClick={() => onPick(k)} aria-pressed={value === k} title={label(k)} aria-label={label(k)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 12, cursor: 'pointer',
      background: value === k ? 'var(--warm-accent-light)' : 'var(--warm-card)',
      border: `2px solid ${value === k ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    }}>
      <TaskIcon iconKey={k} size={30} />
    </button>
  );

  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={t('iconPicker.title')} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '88vh' }}>
        {/* Live preview: the chore as it shows on Home */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: roomColor || 'var(--warm-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TaskIcon iconKey={value} size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{taskName.trim() || t('iconPicker.yourChore')}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{roomName}{roomName ? ' · ' : ''}{label(value)}</div>
          </div>
          {coins != null && coins > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)' }}><CoinIcon />{coins}</span>
          )}
        </div>

        {suggested && suggested !== value && (
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => onPick(suggested)}
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            ✨ {t('iconPicker.suggested')} <TaskIcon iconKey={suggested} size={20} /> {label(suggested)}
          </button>
        )}

        <input className="tq-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('iconPicker.search')} aria-label={t('iconPicker.search')} />

        <div style={{ overflowY: 'auto', display: 'grid', gap: 12, minHeight: 0 }}>
          {groups.map((g) => (
            <div key={g.id} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(`iconGroups.${g.id}`)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{g.keys.map(cell)}</div>
            </div>
          ))}
          {groups.length === 0 && <div className="tq-empty-state">{t('iconPicker.none')}</div>}
        </div>
        <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" style={{ alignSelf: 'flex-end' }} onClick={onClose}>{t('iconPicker.done')}</button>
      </div>
    </div>,
    document.body,
  );
}
