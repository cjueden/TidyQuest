import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../icons/UIIcons';
import { useTranslation } from '../../hooks/useTranslation';
import { api, type LoginDetails } from '../../hooks/useApi';
import UserAvatar from '../shared/UserAvatar';
import { authLanguage, rememberFamily, rememberedFamily } from '../../utils/hosted';

// The README's steps for resetting the first parent's password (ADMIN_RESET_PASSWORD)
const RECOVERY_URL = 'https://github.com/cjueden/TidyQuest#admin-password-recovery';

interface LoginUser {
  username: string;
  displayName: string;
  avatarColor: string;
  avatarType: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
}

interface LoginProps {
  onLogin: (details: LoginDetails) => Promise<void>;
  onSwitchToRegister: () => void;
  /** Hosted mode: parents sign in with their email, kids with the family code (no one is listed) */
  hosted?: boolean;
  onSignUp?: () => void;
}

const linkButton: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--warm-accent)', fontSize: 13,
  fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito', padding: '6px 2px',
};

export function Login({ onLogin, onSwitchToRegister, hosted = false, onSignUp }: LoginProps) {
  const [language, setLanguage] = useState(authLanguage);
  const { t } = useTranslation(language);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [avatarUsers, setAvatarUsers] = useState<LoginUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Hosted: the family this device remembers (from the family link or the last kid login)
  const [familyCode, setFamilyCode] = useState(rememberedFamily);
  const [editingCode, setEditingCode] = useState(() => !rememberedFamily());
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotState, setForgotState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const byEmail = hosted && username.includes('@');

  useEffect(() => {
    api.getRegistrationStatus()
      .then((s) => setRegistrationEnabled(s.registrationEnabled))
      .catch(() => {});
    api.getLoginAvatars()
      .then((users) => setAvatarUsers(users))
      .catch(() => {});
  }, []);

  const handleAvatarClick = (user: LoginUser) => {
    setUsername(user.username);
    setSelectedUser(user.username);
    setError('');
    setPassword('');
    setTimeout(() => passwordRef.current?.focus(), 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!hosted) await onLogin({ username: username.trim(), password });
      else if (byEmail) await onLogin({ email: username.trim(), password });
      else {
        await onLogin({ familyCode: familyCode.trim(), username: username.trim(), password });
        rememberFamily(familyCode.trim().toLowerCase());
      }
      window.location.href = '/';
    } catch (err: any) {
      // A wrong name or password, in the page's language
      if (err?.message === 'Invalid credentials') setError(t(!hosted ? 'auth.loginFailed' : byEmail ? 'hosted.loginFailedEmail' : 'hosted.loginFailed'));
      else setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--warm-bg)',
    }}>
      <div className="tq-card auth-card" style={{ padding: 40, width: 380, maxWidth: 'calc(100vw - 24px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 18, margin: '0 auto 14px',
            background: 'var(--warm-streak-bg)',
            border: '1.5px solid var(--warm-streak-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SparkleIcon />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>TidyQuest</h1>
          <p style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 4 }}>{t('auth.welcomeBack')}</p>
          <select
            value={language}
            onChange={(e) => {
              const v = e.target.value;
              setLanguage(v);
              localStorage.setItem('tidyquest_auth_lang', v);
            }}
            style={{
              marginTop: 10, padding: '6px 10px', borderRadius: 10, border: '1.5px solid var(--warm-border)',
              fontSize: 12, fontFamily: 'Nunito', fontWeight: 700, color: 'var(--warm-text-secondary)', backgroundColor: 'var(--warm-bg-subtle)',
            }}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="it">Italiano</option>
            <option value="nl">Nederlands</option>
          </select>
        </div>

        {avatarUsers.length > 0 && !selectedUser && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', textAlign: 'center', marginBottom: 12 }}>
              {t('auth.selectUser')}
            </p>
            <div style={{
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12,
            }}>
              {avatarUsers.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => handleAvatarClick(u)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '10px 8px', borderRadius: 14, border: '1.5px solid var(--warm-border)',
                    backgroundColor: 'var(--warm-bg-subtle)', cursor: 'pointer',
                    minWidth: 72, transition: 'all 0.15s ease', fontFamily: 'Nunito',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--warm-accent)';
                    e.currentTarget.style.backgroundColor = 'var(--warm-accent-light)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--warm-border)';
                    e.currentTarget.style.backgroundColor = 'var(--warm-bg-subtle)';
                  }}
                >
                  <UserAvatar
                    name={u.displayName}
                    color={u.avatarColor}
                    size={48}
                    avatarType={u.avatarType as any}
                    avatarPreset={u.avatarPreset}
                    avatarPhotoUrl={u.avatarPhotoUrl}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text)' }}>
                    {u.displayName}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setSelectedUser('')}
                style={{
                  background: 'none', border: 'none', color: 'var(--warm-text-light)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Nunito',
                  textDecoration: 'underline',
                }}
              >
                {t('auth.orTypeUsername')}
              </button>
            </div>
          </div>
        )}

        {(selectedUser !== null || avatarUsers.length === 0) && (
          <form onSubmit={handleSubmit}>
            {selectedUser && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                {(() => {
                  const u = avatarUsers.find((a) => a.username === selectedUser);
                  if (!u) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <UserAvatar
                        name={u.displayName}
                        color={u.avatarColor}
                        size={56}
                        avatarType={u.avatarType as any}
                        avatarPreset={u.avatarPreset}
                        avatarPhotoUrl={u.avatarPhotoUrl}
                      />
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{u.displayName}</span>
                      <button
                        type="button"
                        onClick={() => { setSelectedUser(null); setUsername(''); setPassword(''); setError(''); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--warm-text-light)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Nunito',
                          textDecoration: 'underline',
                        }}
                      >
                        {t('auth.switchUser')}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {!selectedUser && (
              <div style={{ marginBottom: 14 }}>
                <label className="tq-label" style={{ textTransform: 'none' }}>{t(hosted ? 'hosted.emailOrUsername' : 'auth.username')}</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  className="tq-input" style={{ backgroundColor: 'var(--warm-bg-subtle)' }}
                  placeholder={t(hosted ? 'hosted.emailOrUsernamePlaceholder' : 'auth.usernamePlaceholder')}
                  autoComplete="username" autoCapitalize="none"
                />
              </div>
            )}
            {hosted && !byEmail && (editingCode ? (
              <div style={{ marginBottom: 14 }}>
                <label className="tq-label" style={{ textTransform: 'none' }}>{t('hosted.familyCode')}</label>
                <input value={familyCode} onChange={(e) => setFamilyCode(e.target.value)}
                  className="tq-input" style={{ backgroundColor: 'var(--warm-bg-subtle)' }}
                  placeholder={t('hosted.familyCodePlaceholder')} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                />
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', marginTop: 4 }}>{t('hosted.familyCodeHelp')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-secondary)' }}>
                <span style={{ overflowWrap: 'anywhere' }}>{t('hosted.familyCodeShown').replace('{code}', familyCode)}</span>
                <button type="button" style={linkButton} onClick={() => setEditingCode(true)}>{t('hosted.change')}</button>
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <label className="tq-label" style={{ textTransform: 'none' }}>{t('auth.password')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                ref={passwordRef}
                className="tq-input" style={{ backgroundColor: 'var(--warm-bg-subtle)' }}
                placeholder={t('auth.passwordPlaceholder')}
              />
              <div style={{ textAlign: 'right', marginTop: 4 }}>
                <button type="button" onClick={() => setShowForgot((v) => !v)}
                  aria-expanded={showForgot} aria-controls="forgot-password-help"
                  style={{
                    background: 'none', border: 'none', color: 'var(--warm-accent)', fontSize: 13,
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito', padding: '6px 2px',
                  }}>
                  {t('auth.forgotPassword')}
                </button>
              </div>
              {showForgot && hosted && (
                <div id="forgot-password-help" style={{
                  marginTop: 4, padding: '10px 12px', borderRadius: 12, backgroundColor: 'var(--warm-bg-subtle)',
                  border: '1.5px solid var(--warm-border)', fontSize: 12, fontWeight: 600,
                  color: 'var(--warm-text-secondary)', lineHeight: 1.5, display: 'grid', gap: 8,
                }}>
                  <p style={{ margin: 0 }}>{t('hosted.forgotParents')}</p>
                  {forgotState === 'sent' ? (
                    <p role="status" style={{ margin: 0, color: 'var(--warm-text)', fontWeight: 700 }}>{t('hosted.forgotSent')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                        className="tq-input" style={{ flex: '1 1 160px', minWidth: 0 }} placeholder={t('hosted.emailPlaceholder')}
                        aria-label={t('hosted.email')} autoComplete="email" />
                      <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={forgotState === 'sending' || !forgotEmail.includes('@')}
                        onClick={() => {
                          setForgotState('sending');
                          api.forgotPassword(forgotEmail.trim())
                            .then(() => setForgotState('sent'))
                            .catch((err) => { setForgotState('idle'); setError(err?.message || t('common.actionFailed')); });
                        }}>
                        {forgotState === 'sending' ? t('hosted.sending') : t('hosted.sendLink')}
                      </button>
                    </div>
                  )}
                  <p style={{ margin: 0 }}>{t('auth.forgotAskParent')}</p>
                </div>
              )}
              {showForgot && !hosted && (
                <div id="forgot-password-help" style={{
                  marginTop: 4, padding: '10px 12px', borderRadius: 12, backgroundColor: 'var(--warm-bg-subtle)',
                  border: '1.5px solid var(--warm-border)', fontSize: 12, fontWeight: 600,
                  color: 'var(--warm-text-secondary)', lineHeight: 1.5,
                }}>
                  <p style={{ margin: 0 }}>{t('auth.forgotAskParent')}</p>
                  <p style={{ margin: '6px 0 0' }}>
                    {t('auth.forgotNoParent')}{' '}
                    <a href={RECOVERY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--warm-accent)', fontWeight: 700 }}>
                      {t('auth.forgotHowTo')}
                    </a>
                  </p>
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 12, color: 'var(--warm-badge-text)', fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>{error}</div>}

            <button type="submit" className="tq-btn tq-btn-primary tq-btn-lg"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t('auth.loggingIn') : t('auth.logIn')}
            </button>
          </form>
        )}

        {hosted && onSignUp && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button type="button" onClick={onSignUp} style={linkButton}>{t('hosted.createFamilyLink')}</button>
          </div>
        )}

        {registrationEnabled && !hosted && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button onClick={onSwitchToRegister}
              style={{
                background: 'none', border: 'none', color: 'var(--warm-accent)', fontSize: 13,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito',
              }}>
              {t('auth.createAccount')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
