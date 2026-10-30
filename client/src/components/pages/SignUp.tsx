import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import type { User } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { deviceZone } from '../../utils/clock';
import { authLanguage, hostedError } from '../../utils/hosted';
import { AuthCard, AuthField } from '../shared/AuthCard';
import { authError, authLink } from '../shared/authStyles';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; language?: string }) => string;
      remove: (id: string) => void;
    };
  }
}

/** Cloudflare Turnstile, the check that you're not a robot (only when the server has a key). */
function Turnstile({ siteKey, language, onToken }: { siteKey: string; language: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(onToken);
  useEffect(() => { latest.current = onToken; });
  useEffect(() => {
    let id: string | undefined;
    const render = () => {
      if (!box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: siteKey, language,
        callback: (token) => latest.current(token),
        'expired-callback': () => latest.current(''),
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => { if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey, language]);
  return <div ref={box} style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, minHeight: 65 }} />;
}

/** "I agree to the {terms} and the {privacy}." with the two links in place */
function withLinks(text: string, links: Record<string, { href: string; label: string }>) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const link = links[part.slice(1, -1)];
    return link
      ? <a key={i} href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--warm-accent)', fontWeight: 700 }}>{link.label}</a>
      : part;
  });
}

// Sign-up (hosted mode): a new family, with this parent as its admin. Everyone else is added in Settings.
export function SignUp({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const navigate = useNavigate();
  const [language] = useState(authLanguage);
  const { t } = useTranslation(language);
  const [config, setConfig] = useState<{ turnstileSiteKey: string | null; termsUrl: string | null; privacyUrl: string | null } | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  // A CAPTCHA answer works once, so a failed try gets a fresh check
  const [captchaRound, setCaptchaRound] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const zone = deviceZone();

  useEffect(() => {
    api.hostedConfig().then(setConfig).catch(() => setConfig({ turnstileSiteKey: null, termsUrl: null, privacyUrl: null }));
  }, []);

  const needsTerms = !!(config?.termsUrl || config?.privacyUrl);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (config?.turnstileSiteKey && !captchaToken) return setError(t('hosted.captchaNeeded'));
    setBusy(true);
    try {
      const { token, user } = await api.signUp({
        familyName: familyName.trim(), parentName: parentName.trim(), email: email.trim(), password,
        timeZone: zone, language, captchaToken: captchaToken || undefined, ...(needsTerms && { acceptTerms: agreed }),
      });
      onSignedIn(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(hostedError(err, t, (err as Error)?.message || t('hosted.signupFailed')));
      setCaptchaToken('');
      setCaptchaRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('hosted.signupTitle')} subtitle={t('hosted.signupSubtitle')}>
      <form onSubmit={submit}>
        <AuthField label={t('hosted.familyName')}>
          <input className="tq-input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={60} required
            placeholder={t('hosted.familyNamePlaceholder')} />
        </AuthField>
        <AuthField label={t('hosted.yourName')}>
          <input className="tq-input" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={40} required
            placeholder={t('hosted.yourNamePlaceholder')} autoComplete="given-name" />
        </AuthField>
        <AuthField label={t('hosted.email')}>
          <input className="tq-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            placeholder={t('hosted.emailPlaceholder')} autoComplete="email" />
        </AuthField>
        <AuthField label={t('auth.password')} hint={t('hosted.passwordMin8')}>
          <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            autoComplete="new-password" />
        </AuthField>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', margin: '0 0 14px' }}>
          {t('hosted.timeZoneNote').replace('{zone}', zone.replace(/_/g, ' '))}
        </p>
        {/* Room for the terms, privacy policy and COPPA consent the lawyer settles in Phase 3: they show once the server has the links */}
        {needsTerms && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--warm-text-secondary)', marginBottom: 14 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required style={{ marginTop: 2 }} />
            <span>{withLinks(t('hosted.agreeTerms'), {
              terms: { href: config!.termsUrl ?? '', label: t('hosted.terms') },
              privacy: { href: config!.privacyUrl ?? '', label: t('hosted.privacy') },
            })}</span>
          </label>
        )}
        {config?.turnstileSiteKey && (
          <Turnstile key={captchaRound} siteKey={config.turnstileSiteKey} language={language} onToken={setCaptchaToken} />
        )}
        {error && <div role="alert" style={authError}>{error}</div>}
        <button type="submit" className="tq-btn tq-btn-primary tq-btn-lg" disabled={busy || !config} style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? t('hosted.creating') : t('hosted.createFamilyAction')}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <button type="button" style={authLink} onClick={() => navigate('/login')}>{t('hosted.haveFamily')}</button>
      </div>
    </AuthCard>
  );
}
