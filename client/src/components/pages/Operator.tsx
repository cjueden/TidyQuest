import { useEffect, useState } from 'react';
import { useHosted } from '../../utils/hosted';
import { AuthCard, AuthField } from '../shared/AuthCard';
import { authError, authLink } from '../shared/authStyles';

// The operator page (/operator, hosted mode only, NEW-13): the families on this server, with suspend,
// resume, delete and resend. It has its own sign-in and token, kept apart from a family login in the same
// browser. English only: families never see it.

const TOKEN_KEY = 'tidyquest_operator_token';
const PAGE = 50;
const MIN_PASSWORD = 12;
const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

type Status = 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
interface Family {
  id: string; name: string; code: string | null; status: Status; plan: string | null; trialEndsAt: string | null;
  createdAt: string; lastActiveAt: string | null; deletedAt: string | null;
  people: number | null; filesBytes: number | null; dataBytes: number | null;
  parents: { email: string; confirmed: boolean }[];
}
interface FamilyList {
  totals: Record<Status | 'newThisWeek', number>;
  found: number;
  filesLimitBytes: number;
  keepDeletedDays: number;
  families: Family[];
}

function savedToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private window: signed in until the tab closes */ }
}

class SignedOut extends Error {}

async function call<T>(path: string, token: string | null, body?: object): Promise<T> {
  const res = await fetch(`/api/operator${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Request failed' }));
  if (res.status === 401 && token) throw new SignedOut();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

const LABELS: Record<Status, string> = { trial: 'Trial', active: 'Active', suspended: 'Paused', expired: 'Expired', deleted: 'Deleted' };
const PILLS: Record<Status, React.CSSProperties> = {
  trial: { background: 'var(--warm-accent-light)', color: 'var(--warm-accent)' },
  active: { background: 'var(--warm-streak-bg)', color: 'var(--warm-streak-text)' },
  suspended: { background: 'var(--warm-danger-bg)', color: 'var(--warm-danger)' },
  expired: { background: 'var(--warm-badge-bg)', color: 'var(--warm-badge-text)' },
  deleted: { background: 'var(--warm-bg-subtle)', color: 'var(--warm-text-light)' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function ago(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
const size = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} KB`);
const message = (err: unknown) => (err instanceof Error ? err.message : 'Request failed');

const muted: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' };
const line: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--warm-text-secondary)', marginTop: 6 };
const okLine: React.CSSProperties = { ...line, color: 'var(--warm-streak-text)' };
const failedLine: React.CSSProperties = { ...line, color: 'var(--warm-danger)' };

/** The last action's message, also shown on its family's card (the top of the page can be off-screen). */
interface CardResult { id: string; name: string; index: number; text: string; failed: boolean }
type Act = (path: string, body: object, done: string) => Promise<boolean>;

export default function OperatorPage() {
  const hosted = useHosted();
  const [token, setToken] = useState(savedToken);

  useEffect(() => { document.title = 'TidyQuest operator'; }, []);

  const signIn = (next: string) => { saveToken(next); setToken(next); };
  const signOut = () => { saveToken(null); setToken(null); };

  if (hosted === null) return null;
  if (!hosted) {
    return (
      <AuthCard title="Operator page">
        <p style={{ ...line, textAlign: 'center' }}>This server isn't in hosted mode, so it has no operator page.</p>
        <div style={{ textAlign: 'center', marginTop: 12 }}><a href="/" style={authLink}>Open TidyQuest</a></div>
      </AuthCard>
    );
  }
  if (!token) return <OperatorLogin onSignedIn={signIn} />;
  return <Families token={token} onToken={signIn} onSignedOut={signOut} />;
}

function OperatorLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onSignedIn((await call<{ token: string }>('/login', null, { email, password })).token);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Operator sign-in" subtitle="For the people running this server">
      <form onSubmit={submit}>
        <AuthField label="Email">
          <input className="tq-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </AuthField>
        <AuthField label="Password">
          <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </AuthField>
        {error && <div role="alert" style={authError}>{error}</div>}
        <button type="submit" className="tq-btn tq-btn-primary tq-btn-lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          Sign in
        </button>
      </form>
    </AuthCard>
  );
}

function Families({ token, onToken, onSignedOut }: { token: string; onToken: (token: string) => void; onSignedOut: () => void }) {
  const [me, setMe] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [list, setList] = useState<(FamilyList & { now: number }) | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<CardResult | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const failed = (err: unknown) => {
    if (err instanceof SignedOut) onSignedOut();
    else setError(message(err));
  };

  useEffect(() => {
    call<{ email: string }>('/me', token).then((r) => setMe(r.email), failed);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search as you type, once typing stops for a moment
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const families = (offset: number, limit: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (search) params.set('q', search);
    if (status) params.set('status', status);
    return call<FamilyList>(`/families?${params}`, token).then((r) => ({ ...r, now: Date.now() }));
  };

  // A new search or filter starts at the top; after an action, everything shown so far comes again
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    let current = true;
    families(0, shown).then((r) => { if (current) setList(r); }, failed);
    return () => { current = false; };
  }, [token, search, status, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new search or filter also clears the last action's message
  const restart = () => { setShown(PAGE); setNotice(''); setError(''); setResult(null); };
  const pick = (next: Status | null) => { setStatus(next); restart(); };
  const showMore = () => {
    if (!list) return;
    families(list.families.length, PAGE).then((more) => {
      setList({ ...more, families: [...list.families, ...more.families] });
      setShown(list.families.length + more.families.length);
    }, failed);
  };

  const act = async (f: Family, index: number, path: string, body: object, done: string) => {
    setError('');
    setNotice('');
    setResult(null);
    const card = { id: f.id, name: f.name, index };
    try {
      await call(path, token, body);
      setNotice(done);
      setResult({ ...card, text: done, failed: false });
      setReload((n) => n + 1);
      return true;
    } catch (err) {
      failed(err);
      if (!(err instanceof SignedOut)) setResult({ ...card, text: message(err), failed: true });
      return false;
    }
  };

  // A family that left this list (deleted, or no longer matching the filter) keeps a note in its place
  const departed = list && result && !result.failed && !list.families.some((f) => f.id === result.id) ? result : null;
  const cards = list ? list.families.map((f, i) => (
    <FamilyCard key={f.id} family={f} list={list} result={result?.id === f.id ? result : null}
      onAct={(path, body, done) => act(f, i, path, body, done)} />
  )) : [];
  if (departed) {
    cards.splice(Math.min(departed.index, cards.length), 0, (
      <div key={`departed-${departed.id}`} style={{ padding: '10px 14px', borderRadius: 14, border: '1.5px dashed var(--warm-border)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-text-muted)', overflowWrap: 'anywhere' }}>{departed.name}</div>
        <div style={okLine}>{departed.text}</div>
      </div>
    ));
  }

  const signOutEverywhere = () => {
    call('/logout', token, {}).catch(() => {}).finally(onSignedOut);
  };

  const live = list ? list.totals.trial + list.totals.active + list.totals.suspended + list.totals.expired : 0;
  const chips: { status: Status | null; label: string; count: number }[] = list ? [
    { status: null, label: 'All', count: live },
    ...(['trial', 'active', 'suspended', 'expired', 'deleted'] as Status[]).map((s) => ({ status: s, label: LABELS[s], count: list.totals[s] })),
  ] : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--warm-bg)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>TidyQuest operator</h1>
            <div style={{ ...muted, overflowWrap: 'anywhere' }}>{me}</div>
          </div>
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setChangingPassword((v) => !v)}>Password</button>
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={signOutEverywhere} title="Signs out every device">Sign out</button>
        </div>

        {changingPassword && (
          <ChangePassword token={token} onFailed={failed} onChanged={(next) => {
            onToken(next);
            setChangingPassword(false);
            setNotice('Password changed. Other devices are signed out.');
          }} />
        )}

        {list && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16, alignItems: 'center' }}>
            {chips.map((c) => (
              <button key={c.label} type="button" className={`tq-btn tq-btn-sm ${status === c.status ? 'tq-btn-primary' : 'tq-btn-secondary'}`} onClick={() => pick(c.status)}>
                {c.label} {c.count}
              </button>
            ))}
            <span style={{ ...muted, marginLeft: 4 }}>New this week: {list.totals.newThisWeek}</span>
          </div>
        )}

        <input className="tq-input" type="search" value={query} onChange={(e) => { setQuery(e.target.value); restart(); }}
          placeholder="Search: family name, family code or email" aria-label="Search families" style={{ marginTop: 12 }} />

        {notice && <div role="status" style={{ ...okLine, marginTop: 12 }}>{notice}</div>}
        {error && <div role="alert" style={{ ...failedLine, marginTop: 12 }}>{error}</div>}

        {list && (
          <>
            <div style={{ ...muted, margin: '14px 0 8px' }}>
              {list.found === 0 ? 'No families found.' : `Showing ${list.families.length} of ${list.found}`}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {cards}
            </div>
            {list.families.length < list.found && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button type="button" className="tq-btn tq-btn-secondary tq-btn-md" onClick={showMore}>Show more</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FamilyCard({ family: f, list, result, onAct }: {
  family: Family;
  list: FamilyList & { now: number };
  result: CardResult | null;
  onAct: Act;
}) {
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const base = `/families/${f.id}`;
  const nameMatches = typed.trim().toLowerCase() === f.name.trim().toLowerCase();

  const suspend = () => {
    if (window.confirm(`Pause ${f.name}? They'll see the paused page (and can still download their data) until you resume it.`)) {
      void onAct(`${base}/suspend`, {}, `Paused ${f.name}.`);
    }
  };
  const remove = async () => {
    if (await onAct(`${base}/delete`, { name: typed }, `Deleted ${f.name}. Its folder is kept for ${list.keepDeletedDays} days.`)) setDeleting(false);
  };

  const status = f.status === 'trial' && f.trialEndsAt ? `Trial · ends ${day(f.trialEndsAt)}` : LABELS[f.status];
  return (
    <div className="tq-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{f.name}</div>
        <span style={{ ...PILLS[f.status], fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{status}</span>
      </div>
      <div style={{ ...muted, fontFamily: 'ui-monospace, monospace', fontSize: 11, marginTop: 2, overflowWrap: 'anywhere' }}>
        {f.code ? `${f.code} · ` : ''}{f.id}
      </div>
      <div style={line}>
        Created {day(f.createdAt)}
        {f.deletedAt
          ? ` · deleted ${day(f.deletedAt)}, removed for good on ${day(new Date(Date.parse(f.deletedAt) + list.keepDeletedDays * DAY).toISOString())}`
          : f.lastActiveAt && ` · last active ${ago(f.lastActiveAt, list.now)}`}
      </div>
      {f.status !== 'deleted' && (
        <div style={line}>
          {f.people ?? '?'} {f.people === 1 ? 'person' : 'people'} · photos {size(f.filesBytes ?? 0)} of {size(list.filesLimitBytes)} · data {size(f.dataBytes ?? 0)}
        </div>
      )}
      <div style={line}>Plan: {f.plan ?? 'none'}</div>
      {f.parents.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {f.parents.map((p) => (
            <div key={p.email} style={{ ...line, marginTop: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
              <span style={{ overflowWrap: 'anywhere' }}>{p.email}</span>
              {p.confirmed
                ? <span style={{ ...muted, color: 'var(--warm-streak-text)' }}>✓ confirmed</span>
                : (
                  <>
                    <span style={muted}>not confirmed</span>
                    <button type="button" style={{ ...authLink, fontSize: 12, padding: 0 }}
                      onClick={() => void onAct(`${base}/resend-confirmation`, { email: p.email }, `Sent the confirmation email to ${p.email}.`)}>
                      Resend
                    </button>
                  </>
                )}
            </div>
          ))}
        </div>
      )}

      {f.status !== 'deleted' && !deleting && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {f.status === 'suspended'
            ? <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => void onAct(`${base}/resume`, {}, `Resumed ${f.name}.`)}>Resume</button>
            : <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={suspend}>Suspend</button>}
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ color: 'var(--warm-danger)' }} onClick={() => setDeleting(true)}>Delete</button>
        </div>
      )}
      {deleting && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'var(--warm-danger-bg)', border: '1.5px solid var(--warm-danger-border)' }}>
          <div style={{ ...line, marginTop: 0, color: 'var(--warm-danger)' }}>
            Type <b>{f.name}</b> to delete this family. Everyone in it is signed out, and its folder is removed for good after {list.keepDeletedDays} days.
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
            <span style={{ ...muted, display: 'block', marginBottom: 4 }}>Family name, to confirm</span>
            <input className="tq-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={f.name}
              autoComplete="off" spellCheck={false} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={!nameMatches} onClick={() => void remove()}
              style={{ background: 'var(--warm-danger)', borderColor: 'var(--warm-danger)', opacity: nameMatches ? 1 : 0.5 }}>
              Delete for good
            </button>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setDeleting(false); setTyped(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {result && <div style={result.failed ? failedLine : okLine}>{result.text}</div>}
    </div>
  );
}

function ChangePassword({ token, onChanged, onFailed }: { token: string; onChanged: (token: string) => void; onFailed: (err: unknown) => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) return setError("The new passwords don't match");
    setError('');
    try {
      onChanged((await call<{ token: string }>('/password', token, { current, password })).token);
    } catch (err) {
      if (err instanceof SignedOut) onFailed(err);
      else setError(message(err));
    }
  };

  return (
    <form className="tq-card" onSubmit={submit} style={{ padding: 14, marginTop: 14 }}>
      <AuthField label="Current password">
        <input className="tq-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </AuthField>
      <AuthField label="New password" hint={`At least ${MIN_PASSWORD} characters. Other devices are signed out.`}>
        <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password" />
      </AuthField>
      <AuthField label="Repeat the new password">
        <input className="tq-input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password" />
      </AuthField>
      {error && <div role="alert" style={authError}>{error}</div>}
      <button type="submit" className="tq-btn tq-btn-primary tq-btn-md">Save password</button>
    </form>
  );
}
