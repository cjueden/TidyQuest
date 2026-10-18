import type { ReactNode } from 'react';
import { monthName, WEEK_ORDER, weekdayName, type ScheduleValue } from '../../utils/schedule';

// Form controls for a task's scheduling options; the helpers live in utils/schedule.ts.

const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' };
const chip = (on: boolean) => ({
  minWidth: 34, padding: '4px 6px', borderRadius: 16, fontSize: 11, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer',
  border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
  backgroundColor: on ? 'var(--warm-accent-light)' : 'transparent', color: on ? 'var(--warm-accent)' : 'var(--warm-text-light)',
});

/** "Every [interval]" or "On [M T W T F S S]". */
export function DueOnPicker({ value, onChange, interval, t, language, allowOnce = true }: {
  value: ScheduleValue;
  /** Offer "One time" (to-dos can be switched off in Settings → Features) */
  allowOnce?: boolean;
  onChange: (v: ScheduleValue) => void;
  interval: ReactNode;
  t: (key: string) => string;
  language?: string;
}) {
  const toggle = (day: number) => onChange({ ...value, weekdays: value.weekdays ^ (1 << day) });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <select className="tq-input-compact" value={value.mode} aria-label={t('schedule.dueMode')}
        onChange={(e) => {
          const mode = e.target.value as ScheduleValue['mode'];
          // Switching to set days with none picked yet: start from today's weekday
          onChange({ ...value, mode, weekdays: mode === 'weekdays' && !value.weekdays ? 1 << new Date().getDay() : value.weekdays });
        }}>
        <option value="interval">{t('roomDetail.every')}</option>
        <option value="weekdays">{t('schedule.onDays')}</option>
        {(allowOnce || value.mode === 'once') && <option value="once">{t('schedule.once')}</option>}
      </select>
      {value.mode === 'once' ? (
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }} title={t('schedule.oneTimeDesc')}>
          {t('schedule.doBy')}
          <input type="date" className="tq-input-compact" value={value.doBy} onChange={(e) => onChange({ ...value, doBy: e.target.value })} />
        </label>
      ) : value.mode === 'interval' ? interval : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {WEEK_ORDER.map((d) => (
            <button type="button" key={d} style={chip(!!(value.weekdays & (1 << d)))} onClick={() => toggle(d)} aria-pressed={!!(value.weekdays & (1 << d))}>
              {weekdayName(d, language)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Only in season [Apr] – [Oct]". */
export function SeasonPicker({ value, onChange, t, language }: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  t: (key: string) => string;
  language?: string;
}) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthSelect = (month: number, set: (m: number) => void, label: string) => (
    <select className="tq-input-compact" value={month} aria-label={label} onChange={(e) => set(Number(e.target.value))}>
      {months.map((m) => <option key={m} value={m}>{monthName(m, language)}</option>)}
    </select>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={t('schedule.seasonDesc')}>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={value.seasonOn} onChange={(e) => onChange({ ...value, seasonOn: e.target.checked })}
          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
        {t('schedule.season')}
      </label>
      {value.seasonOn && (
        <>
          {monthSelect(value.seasonStart, (m) => onChange({ ...value, seasonStart: m }), t('schedule.seasonFrom'))}
          <span style={labelStyle}>–</span>
          {monthSelect(value.seasonEnd, (m) => onChange({ ...value, seasonEnd: m }), t('schedule.seasonTo'))}
        </>
      )}
    </div>
  );
}

/** For rotating tasks: whose turn moves on after each completion, or every Monday. */
export function RotationPeriodPicker({ value, onChange, t }: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <label style={labelStyle}>{t('schedule.turnChanges')}</label>
      <select className="tq-input-compact" value={value.rotationPeriod}
        onChange={(e) => onChange({ ...value, rotationPeriod: e.target.value as ScheduleValue['rotationPeriod'] })}>
        <option value="completion">{t('schedule.turnEachTime')}</option>
        <option value="week">{t('schedule.turnWeekly')}</option>
      </select>
    </div>
  );
}

/** "⏰ Remind at [19:00] [on the day | the day before]" (then again, then a parent, if it's still not done). */
export function ReminderPicker({ value, onChange, t }: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={t('schedule.reminderDesc')}>
      <label style={labelStyle}>⏰ {t('schedule.reminder')}</label>
      <input type="time" className="tq-input-compact" value={value.reminderTime} aria-label={t('schedule.reminder')}
        onChange={(e) => onChange({ ...value, reminderTime: e.target.value })} />
      {value.reminderTime && (
        <>
          <select className="tq-input-compact" value={value.reminderDayBefore ? 'before' : 'same'} aria-label={t('schedule.reminderWhen')}
            onChange={(e) => onChange({ ...value, reminderDayBefore: e.target.value === 'before' })}>
            <option value="same">{t('schedule.reminderSameDay')}</option>
            <option value="before">{t('schedule.reminderDayBefore')}</option>
          </select>
          <button type="button" className="tq-btn tq-btn-sm" onClick={() => onChange({ ...value, reminderTime: '', reminderDayBefore: false })}>×</button>
        </>
      )}
    </div>
  );
}

/** "⏱️ Timer [10] min": a countdown kids start from the chore (empty = no timer). */
export function TimerPicker({ value, onChange, t }: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={t('timer.settingDesc')}>
      <label style={labelStyle} htmlFor="tq-timer-minutes">⏱️ {t('timer.setting')}</label>
      <input id="tq-timer-minutes" type="number" inputMode="numeric" min={1} max={240} step={1} className="tq-input-compact"
        style={{ width: 72 }} value={value.timerMinutes} placeholder={t('timer.off')}
        onChange={(e) => onChange({ ...value, timerMinutes: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} />
      <span style={labelStyle}>{t('timer.minutes')}</span>
      {value.timerMinutes && (
        <button type="button" className="tq-btn tq-btn-sm" aria-label={t('timer.off')} onClick={() => onChange({ ...value, timerMinutes: '' })}>×</button>
      )}
    </div>
  );
}

/** The chore's steps, one per line: tick boxes in One thing at a time. */
export function StepsField({ value, onChange, t }: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  t: (key: string) => string;
}) {
  const count = value.steps.split('\n').filter((s) => s.trim()).length;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label style={labelStyle} htmlFor="tq-chore-steps">☑️ {t('focus.stepsLabel')}</label>
      <textarea id="tq-chore-steps" className="tq-input-compact" rows={Math.min(6, Math.max(2, count + 1))} value={value.steps}
        placeholder={t('focus.stepsPlaceholder')} maxLength={12 * 121}
        onChange={(e) => onChange({ ...value, steps: e.target.value })} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('focus.stepsDesc')}</span>
    </div>
  );
}
