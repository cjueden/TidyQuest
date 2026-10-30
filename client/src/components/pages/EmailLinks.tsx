import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import type { User } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { authLanguage, hostedError } from '../../utils/hosted';
import { AuthCard, AuthField } from '../shared/AuthCard';
import { authError, authLink } from '../shared/authStyles';

// The pages the links in hosted mode's emails open: /reset-password?token=… and /confirm-email?token=…

/** Forgot password: a new one, which signs out every other device and signs in here. */
export function ResetPassword({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [language] = useState(authLanguage);
  const { t } = useTranslation(language);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) return setError(t('hosted.passwordsDiffer'));
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.resetPassword(params.get('token') ?? '', password);
      onSignedIn(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      if ((err as { body?: { code?: string } })?.body?.code === 'link-expired') setExpired(true);
      setError(hostedError(err, t, t('common.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('hosted.resetTitle')}>
      {!expired && (
        <form onSubmit={submit}>
          <AuthField label={t('hosted.newPassword')} hint={t('hosted.passwordMin8')}>
            <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </AuthField>
          <AuthField label={t('hosted.repeatPassword')}>
            <input className="tq-input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} autoComplete="new-password" />
          </AuthField>
          {error && <div role="alert" style={authError}>{error}</div>}
          <button type="submit" className="tq-btn tq-btn-primary tq-btn-lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {t('hosted.savePassword')}
          </button>
        </form>
      )}
      {expired && <div role="alert" style={authError}>{error}</div>}
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <button type="button" style={authLink} onClick={() => navigate('/login')}>{t('hosted.backToLogin')}</button>
      </div>
    </AuthCard>
  );
}

// One request per link, even when React runs the page's effect twice
const confirming = new Map<string, Promise<{ ok: boolean; email: string }>>();

/** The confirmation link (sign-up, or a new email). Works signed in or not. */
export function ConfirmEmail({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [language] = useState(authLanguage);
  const { t } = useTranslation(language);
  const [result, setResult] = useState<{ email?: string; failed?: unknown } | null>(null);
  const token = params.get('token') ?? '';

  useEffect(() => {
    if (!confirming.has(token)) confirming.set(token, api.confirmEmail(token));
    confirming.get(token)!
      .then((r) => setResult({ email: r.email }))
      .catch((failed) => setResult({ failed }));
  }, [token]);

  return (
    <AuthCard title={result?.email ? t('hosted.emailConfirmed').replace('{email}', result.email) : t('hosted.confirming')}>
      {result?.failed !== undefined && <div role="alert" style={authError}>{hostedError(result.failed, t, t('common.actionFailed'))}</div>}
      {result && (
        <button type="button" className="tq-btn tq-btn-primary tq-btn-lg" style={{ width: '100%', justifyContent: 'center' }}
          // A full load, so a signed-in app picks up the confirmed email
          onClick={() => { if (signedIn) window.location.href = '/'; else navigate('/login', { replace: true }); }}>
          {signedIn ? t('hosted.openApp') : t('hosted.backToLogin')}
        </button>
      )}
    </AuthCard>
  );
}
