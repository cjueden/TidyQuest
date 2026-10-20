import { useState, type ReactNode } from 'react';
import { formatValue, waitValue } from './insightsData';
import type { LateItem, UndoneItem, WaitItem } from './insightsData';

const muted = { fontSize: 12, color: 'var(--warm-text-muted)' } as const;
const SHOWN = 5;

interface RowProps { name: string; room: string | null; value: string; detail: ReactNode; share: number }

/** One ranked row: name (and room), the key number, a detail line and a single-hue magnitude bar. */
function Row({ name, room, value, detail, share }: RowProps) {
  return (
    <li style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--warm-border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {/* Names wrap: unbreakable text would prop the page wider than a phone */}
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>
          {name}{room && <span style={{ ...muted, fontWeight: 400 }}> · {room}</span>}
        </span>
        <strong style={{ fontSize: 14, color: 'var(--warm-text)', whiteSpace: 'nowrap' }}>{value}</strong>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--viz-heat-0)', margin: '5px 0 3px' }}>
        <div style={{ height: 4, borderRadius: 2, width: `${Math.max(2, Math.min(1, share) * 100)}%`, background: 'var(--viz-heat-4)' }} />
      </div>
      <div style={muted}>{detail}</div>
    </li>
  );
}

function List<T extends { key: string }>({ title, hint, note, items, empty, row, t }: {
  title: string; hint: string; note?: string | null; items: T[]; empty: string; row: (item: T) => RowProps; t: (k: string) => string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--warm-text)' }}>{title}</h3>
      <p style={{ ...muted, margin: '2px 0 4px' }}>{hint}{note ? ` ${note}` : ''}</p>
      {items.length === 0 ? <p style={{ ...muted, margin: '6px 0 0', fontStyle: 'italic' }}>{empty}</p> : (
        <ul style={{ margin: 0, padding: 0 }}>
          {shown.map((it) => <Row key={it.key} {...row(it)} />)}
        </ul>
      )}
      {items.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
          style={{ background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)', fontFamily: 'inherit' }}>
          {all ? t('insights.showFewer') : t('insights.showAll').replace('{n}', String(items.length))}
        </button>
      )}
    </div>
  );
}

interface Props {
  lists: { late: LateItem[]; undone: UndoneItem[]; waits: WaitItem[] };
  language: string;
  t: (k: string) => string;
  /** "Recorded since …" or "starts tonight" for the overdue list, when its history doesn't cover the period */
  undoneNote: string | null;
}

/** Often done late, left overdue, and open-pool chores nobody grabbed. Charts only: no tips. */
export function SkippedLists({ lists, language, t, undoneNote }: Props) {
  const num = (v: number, d = 1) => formatValue(v, language, d);
  const days = (v: number) => (Math.abs(v - 1) < 0.05 ? t('insights.day1') : t('insights.days').replace('{n}', num(v)));
  const hours = (h: number) => (h < 1 ? t('insights.underHour') : h < 24 ? t('insights.hours').replace('{n}', num(h, 0)) : days(h / 24));
  const maxDays = Math.max(1, ...lists.undone.map((i) => i.days));
  const maxWait = Math.max(1, ...lists.waits.map(waitValue));

  return (
    <>
      <List t={t} title={t('insights.lateTitle')} hint={t('insights.lateHint')} items={lists.late} empty={t('insights.lateEmpty')}
        row={(i) => ({
          name: i.name, room: i.room, share: i.late / Math.max(1, i.done),
          value: t('insights.lateCount').replace('{late}', String(i.late)).replace('{done}', String(i.done)),
          detail: t('insights.lateDetail').replace('{avg}', days(i.avgDays)).replace('{worst}', days(i.worst)),
        })} />
      <List t={t} title={t('insights.undoneTitle')} hint={t('insights.undoneHint')} note={undoneNote} items={lists.undone} empty={t('insights.undoneEmpty')}
        row={(i) => ({
          name: i.name, room: i.room, share: i.days / maxDays, value: days(i.days),
          detail: t('insights.undoneDetail').replace('{worst}', days(i.worst)),
        })} />
      <List t={t} title={t('insights.waitTitle')} hint={t('insights.waitHint')} items={lists.waits} empty={t('insights.waitEmpty')}
        row={(i) => ({
          name: i.name, room: i.room, share: waitValue(i) / maxWait, value: hours(waitValue(i)),
          detail: [
            i.count ? t('insights.waitDetail').replace('{longest}', hours(i.longest)).replace('{n}', String(i.count)) : null,
            i.now != null ? t('insights.waitNow').replace('{dur}', hours(i.now)) : null,
          ].filter(Boolean).join(' · '),
        })} />
    </>
  );
}
