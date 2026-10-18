import { Suspense, use, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { guideFor, type GuideBlock, type GuideSection } from '../../docs/guide';

/** Every bit of text in a block, for search */
const blockText = (b: GuideBlock): string =>
  'p' in b ? b.p : 'ul' in b ? b.ul.join(' ') : 'ol' in b ? b.ol.join(' ') : 'where' in b ? b.where : 'tip' in b ? b.tip : 'h' in b ? b.h
    : 'flow' in b ? b.flow.map((f) => `${f.title} ${f.text}`).join(' ') : b.qa.map((x) => `${x.q} ${x.a.join(' ')}`).join(' ');

const sectionText = (s: GuideSection) => `${s.title} ${s.blocks.map(blockText).join(' ')}`.toLowerCase();

const text = { fontSize: 14, lineHeight: 1.55, color: 'var(--warm-text-secondary)', fontWeight: 600, margin: 0 } as const;

function Block({ b, query }: { b: GuideBlock; query: string }) {
  if ('p' in b) return <p style={text}>{b.p}</p>;
  if ('h' in b) return <h4 style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 900, color: 'var(--warm-text)' }}>{b.h}</h4>;
  if ('where' in b) {
    return <div style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', background: 'var(--warm-accent-light)', borderRadius: 99, padding: '4px 10px' }}>📍 {b.where}</div>;
  }
  if ('tip' in b) {
    return <div style={{ ...text, padding: '10px 12px', borderRadius: 12, background: 'var(--warm-bg-subtle)', border: '1.5px dashed var(--warm-border)' }}>💡 {b.tip}</div>;
  }
  if ('ul' in b) return <ul style={{ ...text, paddingLeft: 20, display: 'grid', gap: 6 }}>{b.ul.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  if ('ol' in b) return <ol style={{ ...text, paddingLeft: 22, display: 'grid', gap: 6 }}>{b.ol.map((x, i) => <li key={i}>{x}</li>)}</ol>;
  if ('flow' in b) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {b.flow.map((f, i) => (
          <div key={i} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 14, border: '1.5px solid var(--warm-accent)', background: 'var(--warm-accent-light)' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--warm-text)' }}>{f.title}</div>
              <div style={{ ...text, fontSize: 13 }}>{f.text}</div>
            </div>
            {i < b.flow.length - 1 && <span aria-hidden="true" style={{ fontSize: 16, color: 'var(--warm-accent)', lineHeight: 1 }}>↓</span>}
          </div>
        ))}
      </div>
    );
  }
  // Troubleshooting: each problem opens to its causes and fixes (all open while searching)
  const q = query.trim().toLowerCase();
  const items = q ? b.qa.filter((x) => `${x.q} ${x.a.join(' ')}`.toLowerCase().includes(q)) : b.qa;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((x) => (
        <details key={x.q} open={!!q} style={{ borderRadius: 12, border: '1.5px solid var(--warm-border)', background: 'var(--warm-bg-subtle)', padding: '10px 12px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{x.q}</summary>
          <ul style={{ ...text, fontSize: 13, paddingLeft: 18, margin: '8px 0 0', display: 'grid', gap: 6 }}>{x.a.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      ))}
    </div>
  );
}

/** The guide (Settings → Guide & help): setup, how it all connects, and troubleshooting. */
export function Guide({ language }: { language?: string }) {
  // English shows straight away; another language loads its guide the first time
  return <Suspense fallback={null}><GuideBody language={language} /></Suspense>;
}

function GuideBody({ language }: { language?: string }) {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const location = useLocation();
  const guide = guideFor(language);
  const sections = Array.isArray(guide) ? guide : use(guide);
  const [query, setQuery] = useState('');
  // Sections start closed; a link like /guide#troubleshooting opens that one
  const [open, setOpen] = useState<Set<string>>(() => new Set(location.hash ? [location.hash.slice(1)] : []));
  const q = query.trim().toLowerCase();
  const shown = q ? sections.filter((s) => sectionText(s).includes(q)) : sections;
  const toggle = (id: string, on: boolean) => setOpen((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const jump = (id: string) => {
    toggle(id, true);
    window.history.replaceState(null, '', `#${id}`);
    window.setTimeout(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  // Arriving with a hash (Settings → Troubleshooting): go to that section once it has opened. Things that
  // load late above it (the season strip) push it down, so follow it for a moment unless the reader moves first.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return;
    const go = () => document.getElementById(`guide-${id}`)?.scrollIntoView({ block: 'start' });
    const timer = window.setTimeout(go, 50);
    const follow = new ResizeObserver(go);
    follow.observe(document.body);
    const moves = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stop = () => { follow.disconnect(); moves.forEach((m) => window.removeEventListener(m, stop)); };
    moves.forEach((m) => window.addEventListener(m, stop, { passive: true }));
    const settle = window.setTimeout(stop, 1500);
    return () => { window.clearTimeout(timer); window.clearTimeout(settle); stop(); };
  }, [location.hash]);

  return (
    <div className="page-enter tq-page-narrow" style={{ display: 'grid', gap: 14 }}>
      <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ justifySelf: 'start' }} onClick={() => navigate('/settings')}>← {t('nav.settings')}</button>
      <div className="tq-card tq-card-padded" style={{ display: 'grid', gap: 10 }}>
        <p style={text}>{t('guide.intro')}</p>
        <input className="tq-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('guide.search')} aria-label={t('guide.search')} />
        {!q && (
          <nav aria-label={t('guide.contents')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sections.map((s) => (
              <button key={s.id} type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => jump(s.id)}>{s.icon} {s.title}</button>
            ))}
          </nav>
        )}
      </div>

      {shown.map((s) => (
        <details key={s.id} id={`guide-${s.id}`} className="tq-card" open={!!q || open.has(s.id)}
          onToggle={(e) => { if (!q) toggle(s.id, (e.target as HTMLDetailsElement).open); }} style={{ padding: '14px 16px', scrollMarginTop: 80 }}>
          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 16, fontWeight: 900, color: 'var(--warm-text)' }}>
            <span aria-hidden="true">{s.icon}</span> {s.title}
            {s.parents && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--warm-text-light)', border: '1px solid var(--warm-border)', borderRadius: 99, padding: '2px 8px' }}>{t('guide.forParents')}</span>}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {s.blocks.map((b, i) => <Block key={i} b={b} query={query} />)}
          </div>
        </details>
      ))}
      {shown.length === 0 && <div className="tq-empty-state">{t('guide.noMatch')}</div>}
    </div>
  );
}
