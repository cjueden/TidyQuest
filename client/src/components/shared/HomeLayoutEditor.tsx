import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * Home → Customise (ENH-6): the cards in this person's order. Drag a card by its ≡ handle (pointer
 * events, so it works with a finger as well as a mouse), or use ▲▼; the eye shows or hides it.
 */
export function HomeLayoutEditor({ cards, onPlace, onStep, onToggle, onReset, onClose, error, t }: {
  cards: Array<{ id: string; label: string; visible: boolean }>;
  onPlace: (id: string, target: string, where: 'before' | 'after') => void;
  onStep: (id: string, dir: -1 | 1) => void;
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
  error?: boolean;
  t: (key: string) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; target: string | null; where: 'before' | 'after' } | null>(null);

  const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-card-row]') ?? [])];
  const start = (id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, startY: e.clientY, dy: 0, target: null, where: 'before' });
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    // Scroll the list when the finger nears its top or bottom edge
    const box = listRef.current?.getBoundingClientRect();
    if (box && listRef.current) {
      if (e.clientY < box.top + 40) listRef.current.scrollTop -= 10;
      else if (e.clientY > box.bottom - 40) listRef.current.scrollTop += 10;
    }
    let target: string | null = null;
    let where: 'before' | 'after' = 'before';
    for (const row of rows()) {
      const id = row.dataset.cardRow!;
      if (id === drag.id) continue;
      const r = row.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { target = id; where = 'before'; break; }
      target = id; where = 'after';
    }
    setDrag({ ...drag, dy: e.clientY - drag.startY, target, where });
  };
  const end = () => {
    if (drag?.target && Math.abs(drag.dy) > 6) onPlace(drag.id, drag.target, drag.where);
    setDrag(null);
  };

  const iconBtn = { minWidth: 36, height: 36, padding: 0, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as const;
  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={t('dashboard.customise')}
        onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '85vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.customise')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>{t('layout.hint')}</div>
          </div>
          <button type="button" className="tq-btn tq-btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', display: 'grid', gap: 6, paddingBottom: 4 }}>
          {cards.map((card, i) => {
            const dragging = drag?.id === card.id;
            const line = drag && drag.target === card.id && !dragging ? drag.where : null;
            return (
              <div key={card.id} data-card-row={card.id} className="layout-row" style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12,
                border: `1.5px solid ${dragging ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                backgroundColor: dragging ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                transform: dragging ? `translateY(${drag!.dy}px)` : undefined, position: 'relative', zIndex: dragging ? 2 : undefined,
                boxShadow: line === 'before' ? '0 -3px 0 var(--warm-accent)' : line === 'after' ? '0 3px 0 var(--warm-accent)' : undefined,
                opacity: card.visible ? 1 : 0.6,
              }}>
                <button type="button" className="tq-btn tq-btn-sm layout-handle" aria-label={`${t('layout.drag')}: ${card.label}`}
                  onPointerDown={(e) => start(card.id, e)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
                  style={{ ...iconBtn, cursor: 'grab', touchAction: 'none' }}>≡</button>
                <span style={{ flex: '1 1 0', width: 0, fontSize: 14, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere', textDecoration: card.visible ? 'none' : 'line-through' }}>{card.label}</span>
                <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} disabled={i === 0} onClick={() => onStep(card.id, -1)}
                  aria-label={`${t('layout.up')}: ${card.label}`}>▲</button>
                <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} disabled={i === cards.length - 1} onClick={() => onStep(card.id, 1)}
                  aria-label={`${t('layout.down')}: ${card.label}`}>▼</button>
                <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} onClick={() => onToggle(card.id)} aria-pressed={card.visible}
                  aria-label={`${card.visible ? t('layout.hide') : t('layout.show')}: ${card.label}`} title={card.visible ? t('layout.hide') : t('layout.show')}>
                  {card.visible ? '👁️' : '🚫'}
                </button>
              </div>
            );
          })}
        </div>
        {error && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-red, #dc2626)' }}>{t('layout.saveFailed')}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="tq-btn tq-btn-secondary" onClick={onReset}>{t('layout.reset')}</button>
          <button type="button" className="tq-btn tq-btn-primary" onClick={onClose}>{t('layout.done')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
