import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CoinIcon } from '../icons/UIIcons';
import { matchesQuery } from '../../utils/tasks';
import { useTranslation } from '../../hooks/useTranslation';
import type { RewardAvailability, RewardPot } from '../../hooks/useApi';
import { formatCoins } from '../../utils/format';
import { localeFor } from '../../utils/locale';
import { byFeatured } from '../../utils/rewardRules';

interface Reward {
  category?: string | null;
  /** The parents' "Featured" order (0 = not placed) */
  sortOrder?: number;
  id: number;
  title: string;
  description?: string | null;
  costCoins: number;
  isPreset?: boolean;
  /** The reward's usual price when this person has their own price */
  regularCostCoins?: number;
  isShared?: boolean;
  availability?: RewardAvailability | null;
  pot?: RewardPot | null;
  availableUntil?: string | null;
}

interface Redemption {
  id: number;
  title: string;
  costCoins: number;
  redeemedAt: string;
  status: string;
}

interface PendingRequest {
  id: number;
  title: string;
  displayName: string;
  costCoins: number;
  redeemedAt: string;
  status: string;
}

interface RewardsProps {
  language?: string;
  rewards: Reward[];
  mine: Redemption[];
  userCoins: number;
  isAdmin?: boolean;
  pendingRequests?: PendingRequest[];
  onRewardRequestAction?: (id: number, status: 'approved' | 'rejected') => Promise<void>;
  onRedeem: (rewardId: number) => Promise<void>;
  onCancel: (redemptionId: number) => Promise<void>;
  /** Chip coins into a shared reward (Family Goals) */
  onContribute?: (rewardId: number, amount: number) => Promise<void>;
}

/** A shared reward's pot: progress, who chipped in, and a box to add more. */
function SharedPot({ pot, userCoins, language, onContribute }: { pot: RewardPot; userCoins: number; language?: string; onContribute?: (amount: number) => Promise<void> }) {
  const { t } = useTranslation(language);
  const locale = localeFor(language);
  const most = Math.min(pot.remaining, userCoins);
  // Starts at 0 so a stray tap on Chip in can't spend coins
  const [amount, setAmount] = useState('0');
  const n = Math.round(Number(amount));
  const valid = Number.isFinite(n) && n >= 1 && n <= most;
  const [error, setError] = useState('');
  const pct = pot.target > 0 ? Math.min(100, Math.round((pot.saved / pot.target) * 100)) : 0;
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <div style={{ height: 10, borderRadius: 99, backgroundColor: 'var(--warm-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--warm-accent)' }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
        {t('rewardRules.potSaved').replace('{saved}', formatCoins(pot.saved, locale)).replace('{target}', formatCoins(pot.target, locale))}
        {pot.contributors.length > 0 && ` · ${pot.contributors.map((c) => `${c.displayName} ${formatCoins(c.amount, locale)}`).join(', ')}`}
      </div>
      {pot.awaitingApproval ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)' }}>🎉 {t('rewardRules.potWaiting')}</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min={0} max={most} className="tq-input-compact" value={amount} onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.target.select()} aria-label={t('rewardRules.chipIn')} style={{ width: 80 }} disabled={most < 1} />
          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={!valid || !onContribute}
            onClick={async () => {
              setError('');
              if (!valid) return;
              try { await onContribute?.(n); setAmount('0'); } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
            }}>
            {t('rewardRules.chipIn')}
          </button>
          {error && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

export function Rewards({ language, rewards, mine, userCoins, isAdmin, pendingRequests, onRewardRequestAction, onRedeem, onCancel, onContribute }: RewardsProps) {
  const { t } = useTranslation(language);
  const [pendingRewardId, setPendingRewardId] = useState<number | null>(null);
  const [spendFx, setSpendFx] = useState<{ amount: number; key: number } | null>(null);
  const [refundFx, setRefundFx] = useState<{ amount: number; key: number } | null>(null);
  const previousStatuses = useRef<Record<number, string>>({});
  const [searchParams] = useSearchParams();
  // Search opens this page with ?q=<reward title> to show that reward
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [affordableOnly, setAffordableOnly] = useState(false);
  // '' = the default: Featured when the parents have ordered rewards, else cheapest first
  const [sortChoice, setSortChoice] = useState<'' | 'featured' | 'priceLow' | 'priceHigh' | 'name'>('');
  const [category, setCategory] = useState<string | null>(null);

  const pendingReward = useMemo(() => rewards.find((r) => r.id === pendingRewardId) || null, [pendingRewardId, rewards]);

  const presetKeyByTitle: Record<string, string> = {
    'movie night pick': 'movie_night',
    'ice cream treat': 'ice_cream',
    'stay up 30 min': 'late_bedtime',
    'game time bonus': 'game_bonus',
    'choose dinner': 'choose_dinner',
    'park adventure': 'park_adventure',
    'no-chore pass': 'chore_pass',
    'family board game': 'board_game',
  };

  const rewardTitleByName = (title: string): string => {
    const k = presetKeyByTitle[title.toLowerCase()];
    if (k) return t(`rewardsPreset.${k}.title`);
    return title;
  };

  const rewardTitle = (r: Reward): string => {
    return rewardTitleByName(r.title);
  };

  const rewardDesc = (r: Reward): string => {
    const k = presetKeyByTitle[r.title.toLowerCase()];
    if (k) return t(`rewardsPreset.${k}.desc`);
    return r.description || t('rewards.noDescription');
  };

  const hasFeatured = rewards.some((r) => (r.sortOrder ?? 0) > 0);
  const sort = sortChoice || (hasFeatured ? 'featured' : 'priceLow');
  const categories = [...new Set(rewards.map((r) => r.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const hasUncategorized = categories.length > 0 && rewards.some((r) => !r.category);
  const visibleRewards = rewards
    .filter((r) => (!affordableOnly || userCoins >= r.costCoins) && matchesQuery(query, [rewardTitle(r), rewardDesc(r), r.category]))
    .filter((r) => category === null || (category === '' ? !r.category : r.category === category))
    .sort((a, b) => sort === 'featured' ? byFeatured(a, b)
      : sort === 'name' ? rewardTitle(a).localeCompare(rewardTitle(b))
      : (sort === 'priceHigh' ? b.costCoins - a.costCoins : a.costCoins - b.costCoins));
  const chipStyle = (on: boolean): CSSProperties => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text-muted)',
  });

  const confirmRedeem = async () => {
    if (!pendingReward) return;
    await onRedeem(pendingReward.id);
    setSpendFx({ amount: pendingReward.costCoins, key: Date.now() });
    setPendingRewardId(null);
  };

  useEffect(() => {
    if (!spendFx) return;
    const id = window.setTimeout(() => setSpendFx(null), 1500);
    return () => window.clearTimeout(id);
  }, [spendFx]);

  useEffect(() => {
    const prev = previousStatuses.current;
    for (const r of mine) {
      if (prev[r.id] === 'requested' && r.status === 'rejected') {
        setRefundFx({ amount: r.costCoins, key: Date.now() + r.id });
        break;
      }
    }
    const next: Record<number, string> = {};
    mine.forEach((r) => {
      next[r.id] = r.status;
    });
    previousStatuses.current = next;
  }, [mine]);

  useEffect(() => {
    if (!refundFx) return;
    const id = window.setTimeout(() => setRefundFx(null), 1800);
    return () => window.clearTimeout(id);
  }, [refundFx]);

  const statusLabel = (status: string): string => {
    if (status === 'requested') return t('rewards.statusPending');
    if (status === 'approved') return t('rewards.statusApproved');
    if (status === 'rejected') return t('rewards.statusRejected');
    if (status === 'cancelled') return t('rewards.statusCancelled');
    return status;
  };

  const statusStyle = (status: string): CSSProperties => {
    if (status === 'approved') return { color: 'var(--status-approved-text)', backgroundColor: 'var(--status-approved-bg)', border: '1px solid var(--status-approved-border)' };
    if (status === 'rejected') return { color: 'var(--status-rejected-text)', backgroundColor: 'var(--status-rejected-bg)', border: '1px solid var(--status-rejected-border)' };
    if (status === 'cancelled') return { color: 'var(--status-cancelled-text)', backgroundColor: 'var(--status-cancelled-bg)', border: '1px solid var(--status-cancelled-border)' };
    return { color: 'var(--warm-accent)', backgroundColor: 'var(--warm-accent-light)', border: '1px solid var(--warm-accent)' };
  };

  return (
    <div className="page-enter" style={{ display: 'grid', gap: 16 }}>
      <style>{`
        @keyframes coinSpendFloat {
          0% { opacity: 0; transform: translateY(12px) scale(0.9); }
          20% { opacity: 1; transform: translateY(0px) scale(1); }
          100% { opacity: 0; transform: translateY(-26px) scale(1.04); }
        }
        @keyframes coinRefundFloat {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          20% { opacity: 1; transform: translateY(0px) scale(1); }
          100% { opacity: 0; transform: translateY(-24px) scale(1.04); }
        }
      `}</style>
      <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CoinIcon />
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{formatCoins(userCoins, localeFor(language))} {t('settings.coins')}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 4 }}>{t('rewards.balanceHint')}</div>
      </div>

      {isAdmin && pendingRequests && pendingRequests.filter(r => r.status === 'requested').length > 0 && (
        <div className="tq-card tq-card-padded">
          <h3 className="tq-card-title">{t('dashboard.rewardRequestsTitle')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {pendingRequests.filter(r => r.status === 'requested').map((r) => (
              <div key={r.id} style={{ border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{r.displayName} — {rewardTitleByName(r.title)}</div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>{new Date(r.redeemedAt).toLocaleString()} · {r.costCoins} coins</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => onRewardRequestAction?.(r.id, 'approved')}>{t('dashboard.approve')}</button>
                  <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => onRewardRequestAction?.(r.id, 'rejected')}>{t('dashboard.reject')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tq-card rewards-catalog-card tq-card-padded">
        <h3 className="tq-card-title">{t('rewards.catalog')}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            type="search"
            className="tq-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('rewards.searchPlaceholder')}
            aria-label={t('rewards.searchPlaceholder')}
            style={{ flex: '2 1 220px', minWidth: 0 }}
          />
          <select className="tq-input-compact" value={sort} onChange={(e) => setSortChoice(e.target.value as typeof sortChoice)}
            style={{ flex: '1 1 150px', padding: '8px 10px', fontSize: 13, cursor: 'pointer', minWidth: 0 }}>
            {hasFeatured && <option value="featured">{t('rewardOrder.featured')}</option>}
            <option value="priceLow">{t('rewards.sortPriceLow')}</option>
            <option value="priceHigh">{t('rewards.sortPriceHigh')}</option>
            <option value="name">{t('rewards.sortName')}</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--warm-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)', cursor: 'pointer' }} />
            {t('rewards.canAfford')}
          </label>
        </div>
        {categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }} role="group" aria-label={t('rewardOrder.category')}>
            <button type="button" style={chipStyle(category === null)} onClick={() => setCategory(null)}>{t('rewardOrder.all')}</button>
            {categories.map((c) => <button type="button" key={c} style={chipStyle(category === c)} onClick={() => setCategory(c)}>{c}</button>)}
            {hasUncategorized && <button type="button" style={chipStyle(category === '')} onClick={() => setCategory('')}>{t('rewardOrder.other')}</button>}
          </div>
        )}
        {visibleRewards.length === 0 && (
          <div className="tq-empty-state" style={{ padding: '16px 4px' }}>{t('rewards.noMatches')}</div>
        )}
        <div className="rewards-catalog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {visibleRewards.map((r) => {
            const usedUp = !!r.availability && r.availability.remaining <= 0;
            const canBuy = userCoins >= r.costCoins && !usedUp;
            const ownPrice = r.regularCostCoins !== undefined && r.regularCostCoins !== r.costCoins;
            return (
              <div key={r.id} style={{ border: '1.5px solid var(--warm-border)', borderRadius: 14, padding: 12, backgroundColor: 'var(--warm-bg-subtle)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', marginBottom: 4 }}>{rewardTitle(r)}</div>
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, minHeight: 32 }}>{rewardDesc(r)}</div>
                {(r.availability || r.availableUntil) && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: usedUp ? 'var(--warm-danger)' : 'var(--warm-text-muted)', marginTop: 4 }}>
                    {r.availability && (usedUp
                      ? t(`rewardRules.usedUp_${r.availability.period}`)
                      : t(`rewardRules.left_${r.availability.period}`).replace('{n}', String(r.availability.remaining)))}
                    {r.availability && r.availableUntil ? ' · ' : ''}
                    {r.availableUntil && t('rewardRules.untilDate').replace('{date}', new Date(`${r.availableUntil}T12:00:00`).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' }))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <CoinIcon /> {formatCoins(r.costCoins, localeFor(language))}
                    {ownPrice && <span style={{ fontSize: 11, color: 'var(--warm-text-light)', textDecoration: 'line-through', fontWeight: 700 }}>{formatCoins(r.regularCostCoins, localeFor(language))}</span>}
                  </div>
                  {!r.isShared && (
                    <button
                      className="tq-btn tq-btn-primary tq-btn-sm"
                      style={{ opacity: canBuy ? 1 : 0.6 }}
                      disabled={!canBuy}
                      onClick={() => setPendingRewardId(r.id)}
                    >
                      {usedUp ? t('rewardRules.usedUp') : canBuy ? t('rewards.redeem') : t('rewards.notEnough')}
                    </button>
                  )}
                </div>
                {r.isShared && r.pot && (
                  <SharedPot pot={r.pot} userCoins={userCoins} language={language} onContribute={onContribute ? (n) => onContribute(r.id, n) : undefined} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="tq-card tq-card-padded">
        <h3 className="tq-card-title">{t('rewards.myRequests')}</h3>
        {mine.length === 0 ? (
          <div className="tq-empty-state" style={{ padding: '16px 0' }}>{t('rewards.noRequests')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {mine.map((m) => (
              <div key={m.id} className="rewards-my-row" style={{ border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{rewardTitleByName(m.title)}</div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>{new Date(m.redeemedAt).toLocaleString()}</div>
                </div>
                <div className="rewards-my-row-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>- {m.costCoins} <CoinIcon /></div>
                  <span style={{ ...statusStyle(m.status), fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {statusLabel(m.status)}
                  </span>
                  {m.status === 'requested' && (
                    <button className="tq-btn tq-btn-secondary" onClick={() => onCancel(m.id)} style={{ padding: '4px 8px', fontSize: 10 }}>
                      {t('rewards.cancelRequest')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {pendingReward && (
        <div className="tq-modal-overlay" style={{ zIndex: 120 }}>
          <div className="tq-card rewards-confirm-modal tq-modal tq-modal-narrow tq-card-padded">
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--warm-text)', marginBottom: 6 }}>{t('rewards.confirmTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 14 }}>
              {t('rewards.confirmText').replace('{reward}', rewardTitle(pendingReward)).replace('{coins}', String(pendingReward.costCoins))}
            </div>
            <div className="rewards-confirm-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setPendingRewardId(null)}>{t('common.cancel')}</button>
              <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={confirmRedeem}>{t('rewards.confirmBuy')}</button>
            </div>
          </div>
        </div>
      )}
      {spendFx && (
        <div key={spendFx.key} style={{ position: 'fixed', top: 88, right: 80, zIndex: 121, animation: 'coinSpendFloat 1.4s ease forwards', backgroundColor: 'var(--warm-accent-light)', border: '1.5px solid var(--warm-accent)', borderRadius: 14, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: 'var(--warm-accent)' }}>
          -{spendFx.amount} <CoinIcon />
        </div>
      )}
      {refundFx && (
        <div key={refundFx.key} style={{ position: 'fixed', top: 126, right: 80, zIndex: 121, animation: 'coinRefundFloat 1.7s ease forwards', backgroundColor: 'var(--status-approved-bg)', border: '1.5px solid var(--status-approved-border)', borderRadius: 14, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: 'var(--status-approved-text)' }}>
          +{refundFx.amount} <CoinIcon />
        </div>
      )}
    </div>
  );
}
