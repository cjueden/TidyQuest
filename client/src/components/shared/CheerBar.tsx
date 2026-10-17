import { useState } from 'react';
import { api, type CheerSummary } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

const CHEER_EMOJI = ['👏', '🎉', '💪', '⭐'];

const pill = (on: boolean) => ({
  display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 800,
  fontFamily: 'Nunito', cursor: 'pointer', lineHeight: 1.4, color: 'var(--warm-text-secondary)',
  border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`, backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-card)',
});

/**
 * Cheers on a finished chore: what people gave (tap one to give the same), and 👏+ to pick one.
 * The same emoji again takes your cheer back. Nothing shows on your own chore until someone cheers it.
 */
export function CheerBar({ completionId, cheers, canCheer, language, mascotName }: { completionId: number; cheers: CheerSummary; canCheer: boolean; language?: string; mascotName?: string | null }) {
  const { t } = useTranslation(language);
  const [state, setState] = useState(cheers);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canCheer && state.counts.length === 0 && !mascotName) return null;

  const send = async (emoji: string) => {
    if (!canCheer || busy) return;
    setBusy(true);
    try { setState((await api.cheer(completionId, emoji)).cheers); setOpen(false); } catch { /* keep what's shown */ } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 6 }}>
      {mascotName && (
        <span style={{ ...pill(false), cursor: 'default' }} title={t('mascot.cheered').replace('{name}', mascotName)}
          aria-label={t('mascot.cheered').replace('{name}', mascotName)}>🐾</span>
      )}
      {state.counts.map((c) => (
        <button key={c.emoji} type="button" style={{ ...pill(state.mine === c.emoji), cursor: canCheer ? 'pointer' : 'default' }}
          title={c.names.join(', ')} aria-label={`${c.emoji} ${c.names.join(', ')}`} onClick={() => void send(c.emoji)}>
          {c.emoji} {c.count}
        </button>
      ))}
      {canCheer && (open
        ? CHEER_EMOJI.map((e) => (
          <button key={e} type="button" style={pill(state.mine === e)} aria-label={`${t('cheers.add')} ${e}`} disabled={busy} onClick={() => void send(e)}>{e}</button>
        ))
        : (
          <button type="button" style={{ ...pill(false), color: 'var(--warm-text-light)' }} aria-label={t('cheers.add')} onClick={() => setOpen(true)}>
            {state.mine ? '…' : `👏 ${t('cheers.add')}`}
          </button>
        ))}
    </div>
  );
}
