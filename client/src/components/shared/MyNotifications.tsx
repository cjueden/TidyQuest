import { useEffect, useState } from 'react';
import { api, type NotifyPerson } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { PersonNotify } from './NotifyAdmin';

/** Profile: your own notification channels (e.g. an ntfy topic on your phone) and what you get. */
export function MyNotifications({ userId, language }: { userId: number; language?: string }) {
  const { t } = useTranslation(language);
  const [me, setMe] = useState<NotifyPerson | null>(null);
  useEffect(() => { api.getNotifyPerson(userId).then(setMe).catch(() => setMe(null)); }, [userId]);
  if (!me) return null;
  return (
    <div className="tq-card tq-card-padded" style={{ marginTop: 16, display: 'grid', gap: 8 }}>
      <h3 className="tq-card-title" style={{ margin: 0 }}>🔔 {t('notifyAdmin.mineTitle')}</h3>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('notifyAdmin.mineDesc')}</div>
      <PersonNotify person={me} language={language} onSaved={setMe} />
    </div>
  );
}
