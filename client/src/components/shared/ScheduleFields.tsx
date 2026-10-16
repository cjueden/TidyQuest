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
export function DueOnPicker({ value, onChange, interval, t, language }: {
  value: ScheduleValue;
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
      </select>
      {value.mode === 'interval' ? interval : (
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
