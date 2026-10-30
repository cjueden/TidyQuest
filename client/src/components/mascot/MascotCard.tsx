import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';
import { localeFor } from '../../utils/locale';
import { ACCESSORY_SLOTS, Bed, CREATURES, DustBunnies, Egg, OVERLAYS, type AccessoryId, type CreatureId, type MascotMood, type OverlayId } from './MascotArt';
import { wall } from '../../utils/clock';

type Slot = 'head' | 'face' | 'neck' | 'back';
export type Outfit = Partial<Record<Slot, { id: string; by: number; byName: string; at: string }>>;

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
  /** 0–100: each chore fills 5%, empty after 2 days without chores */
  tummy: number;
  /** When the last chore of 3★ effort or more was approved (only those make it cheer) */
  treatAt: string | null;
  bedtimeFrom: string;
  bedtimeTo: string;
  /** null when the shop is switched off */
  shop: Array<{ id: string; slot: Slot; price: number }> | null;
  outfit: Outfit;
}

/** A chore the mascot suggests, and why */
export interface MascotSuggestion { taskId: number; roomId: number; name: string; roomName: string; coins: number | null; reason: 'rescue' | 'teamup' | 'yours' | 'messiest' | 'quick' }

const SCALE: Record<string, number> = { baby: 0.72, kid: 0.86, grown: 1, legendary: 1 };
const COSTUMES: Record<string, OverlayId> = { witch: 'witchHat', pilgrim: 'pilgrimHat', santa: 'santaHat' };
const STAGE_ORDER = ['egg', 'baby', 'kid', 'grown', 'legendary'];
const TAP_LINES = 8;
const HUNGRY_BELOW = 25;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Asleep between bedtimeFrom and bedtimeTo by the clock at home (the window can cross midnight) */
function isAsleep(from: string, to: string, now = new Date()): boolean {
  const { hours, minutes: mins } = wall(now);
  const n = hours * 60 + mins;
  const a = minutes(from), b = minutes(to);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}
/** The first 3 hours after it wakes up */
const isMorning = (to: string, now = new Date()) => {
  const { hours, minutes: mins } = wall(now);
  const n = hours * 60 + mins, w = minutes(to);
  return n >= w && n < w + 180;
};

/** The creature itself: grows by stage, wears its outfit, a costume or a party hat */
export function MascotPicture({ m, costume, size = 112, asleep = false, outfit = {}, bare = false }: {
  m: Pick<MascotData, 'creature' | 'stage' | 'mood' | 'event'>; costume?: string | null; size?: number; asleep?: boolean; outfit?: Outfit;
  /** Only the outfit: no bed, scarf or hat from growing up (the shop's previews) */
  bare?: boolean;
}) {
  const c = CREATURES[m.creature] ?? CREATURES.dog;
  const grown = STAGE_ORDER.indexOf(m.stage);
  const messy = m.mood === 'messy' || m.mood === 'sad';
  const worn = (slot: Slot) => (outfit[slot] && ACCESSORY_SLOTS[outfit[slot]!.id as AccessoryId] === slot ? (outfit[slot]!.id as OverlayId) : null);
  // One thing on its head: party hat > what the family bought > holiday costume > crown > top hat > messy hair
  const head: OverlayId | null = bare ? worn('head') : m.event === 'birthday' ? 'partyHat'
    : worn('head') ?? (costume && COSTUMES[costume] ? COSTUMES[costume]
      : m.stage === 'legendary' ? 'crown' : m.stage === 'grown' ? 'hat' : messy && !asleep ? 'messyHair' : null);
  const neck: OverlayId | null = worn('neck') ?? (grown >= 2 && !bare ? 'scarf' : null);
  const Head = head ? OVERLAYS[head] : null;
  const Neck = neck ? OVERLAYS[neck] : null;
  const Face = worn('face') ? OVERLAYS[worn('face')!] : null;
  const Back = worn('back') ? OVERLAYS[worn('back')!] : null;
  const s = SCALE[m.stage] ?? 1;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-hidden="true"
      style={{ overflow: 'visible', filter: m.stage === 'legendary' ? 'drop-shadow(0 0 8px #FBBF24AA)' : undefined }}>
      {/* Every egg looks the same, so it doesn't give away what will hatch */}
      {m.stage === 'egg' ? <Egg creature="dog" /> : (
        <g transform={`translate(60 112) scale(${s}) translate(-60 -112)`}>
          {grown >= 1 && !bare && <Bed />}
          {Back && <Back a={c.anchors} />}
          <c.Art mood={asleep ? 'sleep' : m.mood} />
          {Neck && <Neck a={c.anchors} />}
          {Face && !asleep && <Face a={c.anchors} />}
          {Head && <Head a={c.anchors} />}
        </g>
      )}
      {messy && m.stage !== 'egg' && <DustBunnies />}
    </svg>
  );
}

/** Home: the family's mascot. Tap it, feed it with chores, ask it what to do, and dress it up. */
export function MascotCard({ m, costume, language, suggestions = [], userId, isParent = false, coins = 0, onChanged }: {
  m: MascotData;
  costume?: string | null;
  language?: string;
  /** Chores it can suggest, best first */
  suggestions?: MascotSuggestion[];
  userId?: number;
  isParent?: boolean;
  /** Your coins (for the shop) */
  coins?: number;
  /** Something changed (a purchase): reload Home */
  onChanged?: () => void;
}) {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const asleep = isAsleep(m.bedtimeFrom, m.bedtimeTo, now);
  const [tap, setTap] = useState<{ line: string; n: number } | null>(null);
  const [suggestIdx, setSuggestIdx] = useState<number | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  // It just had a treat: a bigger chore (3★ or more) was done since you last looked (kept on this device).
  // Smaller chores fill the tummy quietly.
  const [lastTreat] = useState(() => { try { return localStorage.getItem('tidyquest_mascot_treat') ?? m.treatAt; } catch { return m.treatAt; } });
  useEffect(() => { try { if (m.treatAt) localStorage.setItem('tidyquest_mascot_treat', m.treatAt); } catch { /* private mode */ } }, [m.treatAt]);
  const fed = !!m.treatAt && (!lastTreat || m.treatAt > lastTreat);

  const onTap = () => {
    const line = asleep ? t('mascot.sleepTap') : t(`mascot.tap${Math.floor(Math.random() * TAP_LINES) + 1}`);
    setTap((prev) => ({ line, n: (prev?.n ?? 0) + 1 }));
  };
  const hungry = m.tummy < HUNGRY_BELOW && m.stage !== 'egg';
  const say = tap ? tap.line
    : m.event === 'birthday' ? t('mascot.birthday').replace('{name}', m.birthdayName ?? '')
    : m.event === 'teamGoal' ? t('mascot.teamGoal')
    : m.event === 'rescue' ? t('mascot.rescue')
    : asleep ? t('mascot.asleep').replace('{time}', new Date(2000, 0, 1, minutes(m.bedtimeTo) / 60 | 0, minutes(m.bedtimeTo) % 60)
      .toLocaleTimeString(localeFor(language), { hour: 'numeric', minute: '2-digit' }))
    : m.stage === 'egg' ? t('mascot.egg')
    : isMorning(m.bedtimeTo, now) ? t('mascot.morning')
    : hungry ? t('mascot.hungry')
    : m.messiestRoom ? t('mascot.help').replace('{room}', m.messiestRoom.name)
    : t(`mascot.mood_${m.mood}`);
  const motion = asleep ? 'mascot-sleep' : tap ? (tap.n % 2 ? 'mascot-hop' : 'mascot-spin') : m.event ? 'mascot-party' : m.mood === 'happy' ? 'mascot-bounce' : m.mood === 'sad' ? 'mascot-droop' : 'mascot-sway';
  const pct = m.nextStage ? Math.min(100, Math.round((m.familyCoins / m.nextStage.at) * 100)) : 100;
  const idea = suggestIdx != null && suggestions.length > 0 ? suggestions[suggestIdx % suggestions.length] : null;

  return (
    <div className="tq-card tq-card-padded mascot-card" style={{ gridColumn: '1 / -1', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className={motion} key={tap?.n ?? 0} onClick={onTap} aria-label={t('mascot.tapLabel').replace('{name}', m.name)}
        style={{ position: 'relative', flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <span className={fed && !asleep ? 'mascot-cheer' : undefined} style={{ display: 'block' }}>
          <MascotPicture m={m} costume={costume} asleep={asleep} outfit={m.outfit} />
        </span>
        {asleep && <span className="mascot-zzz" aria-hidden="true">💤</span>}
        {m.event && !asleep && <span className="mascot-confetti" aria-hidden="true">🎉</span>}
        {fed && !asleep && <span className="mascot-fed" aria-hidden="true">🍪</span>}
      </button>
      <div style={{ flex: '1 1 180px', minWidth: 0, display: 'grid', gap: 6 }}>
        <div className="mascot-bubble" style={{ position: 'relative', padding: '8px 12px', borderRadius: 14, background: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>
          {say}
          {!tap && !m.event && !asleep && !hungry && m.messiestRoom && m.stage !== 'egg' && (
            <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" style={{ display: 'block', marginTop: 6 }} onClick={() => navigate(`/rooms/${m.messiestRoom!.id}`)}>
              {t('mascot.goHelp')}
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--warm-text)' }}>
          {m.name} <span style={{ fontWeight: 700, color: 'var(--warm-text-muted)' }}>· {t(`mascot.stage_${m.stage}`)}</span>
        </div>
        {/* The tummy: chores feed it */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={t('mascot.tummyDesc')}>
          <span aria-hidden="true">🍪</span>
          <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--health-bar-track)', overflow: 'hidden', display: 'block' }}
            role="meter" aria-valuenow={m.tummy} aria-valuemin={0} aria-valuemax={100} aria-label={t('mascot.tummy')}>
            <span style={{ display: 'block', width: `${m.tummy}%`, height: '100%', background: hungry ? 'var(--warm-danger)' : '#F59E0B' }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', minWidth: 32, textAlign: 'right' }}>{m.tummy}%</span>
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.length > 0 && !asleep && (
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setSuggestIdx((i) => (i == null ? 0 : i + 1))}>
              💡 {t(suggestIdx == null ? 'mascot.whatToDo' : 'mascot.anotherIdea')}
            </button>
          )}
          {m.shop && m.stage !== 'egg' && <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setShopOpen(true)}>🛍️ {t('mascot.shop')}</button>}
          {m.shop && m.stage === 'egg' && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', alignSelf: 'center' }}>{t('mascot.shopAfterHatch')}</span>}
        </div>
        {idea && (
          <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 14, border: '1.5px solid var(--warm-accent)', background: 'var(--warm-accent-light)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)' }}>{t(`mascot.why_${idea.reason}`).replace('{room}', idea.roomName)}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{idea.name}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{idea.roomName}{idea.coins ? ` · 🪙 ${idea.coins}` : ''}</div>
            <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" style={{ justifySelf: 'start' }}
              onClick={() => navigate(`/rooms/${idea.roomId}?task=${idea.taskId}`)}>{t('mascot.letsDoIt')}</button>
          </div>
        )}
      </div>
      {shopOpen && m.shop && m.stage !== 'egg' && (
        <MascotShop m={m} costume={costume} language={language} userId={userId} isParent={isParent} coins={coins}
          onClose={() => setShopOpen(false)} onChanged={() => onChanged?.()} />
      )}
    </div>
  );
}

/** The accessory shop: each item on the mascot as a preview, 1–5 coins, on right away for everyone */
function MascotShop({ m, costume, language, userId, isParent, coins, onClose, onChanged }: {
  m: MascotData; costume?: string | null; language?: string; userId?: number; isParent: boolean; coins: number; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation(language);
  const [outfit, setOutfit] = useState<Outfit>(m.outfit);
  const [wallet, setWallet] = useState(coins);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (fn: () => Promise<{ outfit: Outfit; coins?: number }>) => {
    setBusy(true); setError('');
    try { const r = await fn(); setOutfit(r.outfit); if (r.coins != null) setWallet(r.coins); onChanged(); } catch (err) {
      const key = `mascot.error_${err instanceof Error ? err.message : ''}`;
      setError(t(key) === key ? t('common.error') : t(key));
    } finally { setBusy(false); }
  };
  const slots: Slot[] = ['head', 'face', 'neck', 'back'];
  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={t('mascot.shop')} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '88vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MascotPicture m={{ ...m, stage: m.stage === 'egg' ? 'baby' : m.stage }} costume={costume} outfit={outfit} size={84} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--warm-text)' }}>🛍️ {t('mascot.shopTitle').replace('{name}', m.name)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('mascot.shopDesc')}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', marginTop: 4 }}>🪙 {formatCoins(wallet)}</div>
          </div>
        </div>
        {/* What it's wearing, and who gave it */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {slots.filter((s) => outfit[s]).map((s) => {
            const w = outfit[s]!;
            return (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)', padding: '4px 8px', borderRadius: 99, border: '1px solid var(--warm-border)' }}>
                {t(`mascot.item_${w.id}`)} · {t('mascot.giftFrom').replace('{name}', w.byName)}
                {(w.by === userId || isParent) && (
                  <button type="button" className="tq-btn tq-btn-sm" disabled={busy} style={{ padding: '1px 8px', fontSize: 11 }}
                    onClick={() => void act(() => api.takeOffAccessory(s))}>{t('mascot.takeOff')}</button>
                )}
              </span>
            );
          })}
        </div>
        {error && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</div>}
        <div style={{ overflowY: 'auto', display: 'grid', gap: 12, minHeight: 0 }}>
          {slots.map((slot) => (
            <div key={slot} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(`mascot.slot_${slot}`)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {m.shop!.filter((i) => i.slot === slot).map((i) => {
                  const wearing = outfit[slot]?.id === i.id;
                  return (
                    <div key={i.id} style={{ display: 'grid', justifyItems: 'center', gap: 2, width: 92, padding: 6, borderRadius: 12, border: `2px solid ${wearing ? 'var(--warm-accent)' : 'var(--warm-border)'}` }}>
                      <MascotPicture m={{ ...m, stage: 'grown', mood: 'happy', event: null }} outfit={{ [slot]: { id: i.id, by: 0, byName: '', at: '' } }} size={56} bare />
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text)', textAlign: 'center' }}>{t(`mascot.item_${i.id}`)}</span>
                      <button type="button" className={wearing ? 'tq-btn tq-btn-sm' : 'tq-btn tq-btn-primary tq-btn-sm'} disabled={busy || wearing || wallet < i.price}
                        style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => void act(() => api.buyAccessory(i.id))}>
                        {wearing ? t('mascot.wearing') : `🪙 ${i.price}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ alignSelf: 'flex-end' }} onClick={onClose}>{t('iconPicker.done')}</button>
      </div>
    </div>,
    document.body,
  );
}
