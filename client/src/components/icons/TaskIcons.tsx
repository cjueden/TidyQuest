import { ExtraIcon } from './TaskIconsExtra';
import { EXTRA_KEYS } from './iconGroups';
export type TaskIconKey =
  | 'sparkle' | 'dishes' | 'sink' | 'stove' | 'counter' | 'fridge' | 'oven'
  | 'microwave' | 'kettle' | 'rangehood' | 'pantry' | 'cabinet'
  | 'bed' | 'pillow' | 'sheets' | 'mattress' | 'nightstand'
  | 'toilet' | 'shower' | 'mirror' | 'towel' | 'drain' | 'bathmat'
  | 'showerhead' | 'toothbrush' | 'grout'
  | 'vacuum' | 'mop' | 'dust' | 'sweep'
  | 'window' | 'curtain' | 'lightswitch'
  | 'sofa' | 'tv' | 'lamp' | 'furniture' | 'rug'
  | 'desk' | 'keyboard' | 'monitor' | 'cable' | 'chair'
  | 'trash' | 'broom'
  | 'washer' | 'dryer' | 'detergent' | 'iron' | 'clothes'
  | 'tools' | 'cobweb' | 'chemicals' | 'garagedoor'
  | 'shelf' | 'drawer' | 'closet';

export const TASK_ICON_OPTIONS: Array<{ key: TaskIconKey; label: string }> = [
  { key: 'sparkle', label: 'Sparkle' },
  { key: 'dishes', label: 'Dishes' },
  { key: 'sink', label: 'Sink' },
  { key: 'stove', label: 'Stove' },
  { key: 'counter', label: 'Counter' },
  { key: 'fridge', label: 'Fridge' },
  { key: 'oven', label: 'Oven' },
  { key: 'microwave', label: 'Microwave' },
  { key: 'kettle', label: 'Kettle' },
  { key: 'rangehood', label: 'Range Hood' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'cabinet', label: 'Cabinet' },
  { key: 'bed', label: 'Bed' },
  { key: 'pillow', label: 'Pillow' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'mattress', label: 'Mattress' },
  { key: 'nightstand', label: 'Nightstand' },
  { key: 'toilet', label: 'Toilet' },
  { key: 'shower', label: 'Shower' },
  { key: 'mirror', label: 'Mirror' },
  { key: 'towel', label: 'Towel' },
  { key: 'drain', label: 'Drain' },
  { key: 'bathmat', label: 'Bath Mat' },
  { key: 'showerhead', label: 'Showerhead' },
  { key: 'toothbrush', label: 'Toothbrush' },
  { key: 'grout', label: 'Grout' },
  { key: 'vacuum', label: 'Vacuum' },
  { key: 'mop', label: 'Mop' },
  { key: 'dust', label: 'Dust' },
  { key: 'sweep', label: 'Sweep' },
  { key: 'window', label: 'Window' },
  { key: 'curtain', label: 'Curtain' },
  { key: 'lightswitch', label: 'Switch' },
  { key: 'sofa', label: 'Sofa' },
  { key: 'tv', label: 'TV' },
  { key: 'lamp', label: 'Lamp' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'rug', label: 'Rug' },
  { key: 'desk', label: 'Desk' },
  { key: 'keyboard', label: 'Keyboard' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'cable', label: 'Cable' },
  { key: 'chair', label: 'Chair' },
  { key: 'trash', label: 'Trash' },
  { key: 'broom', label: 'Broom' },
  { key: 'washer', label: 'Washer' },
  { key: 'dryer', label: 'Dryer' },
  { key: 'detergent', label: 'Detergent' },
  { key: 'iron', label: 'Iron' },
  { key: 'clothes', label: 'Clothes' },
  { key: 'tools', label: 'Tools' },
  { key: 'cobweb', label: 'Cobweb' },
  { key: 'chemicals', label: 'Chemicals' },
  { key: 'garagedoor', label: 'Garage' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'drawer', label: 'Drawer' },
  { key: 'closet', label: 'Closet' },
];

// Kawaii color palettes per icon
const P: Record<string, { s: string; b: string; f: string }> = {
  // s=stroke, b=background, f=fill accent
  sparkle:    { s: '#F97316', b: '#FFF1E5', f: '#FBBF24' },
  dishes:     { s: '#3B82F6', b: '#EFF6FF', f: '#93C5FD' },
  sink:       { s: '#0EA5E9', b: '#E0F2FE', f: '#7DD3FC' },
  stove:      { s: '#EF4444', b: '#FEF2F2', f: '#FCA5A5' },
  counter:    { s: '#8B5CF6', b: '#F5F3FF', f: '#C4B5FD' },
  fridge:     { s: '#06B6D4', b: '#ECFEFF', f: '#67E8F9' },
  oven:       { s: '#F97316', b: '#FFF7ED', f: '#FDBA74' },
  microwave:  { s: '#6366F1', b: '#EEF2FF', f: '#A5B4FC' },
  kettle:     { s: '#EC4899', b: '#FDF2F8', f: '#F9A8D4' },
  rangehood:  { s: '#64748B', b: '#F1F5F9', f: '#CBD5E1' },
  pantry:     { s: '#D97706', b: '#FFFBEB', f: '#FDE68A' },
  cabinet:    { s: '#92400E', b: '#FEF3C7', f: '#FDE68A' },
  bed:        { s: '#8B5CF6', b: '#F5F3FF', f: '#DDD6FE' },
  pillow:     { s: '#A78BFA', b: '#F5F3FF', f: '#EDE9FE' },
  sheets:     { s: '#06B6D4', b: '#ECFEFF', f: '#A5F3FC' },
  mattress:   { s: '#9333EA', b: '#FAF5FF', f: '#D8B4FE' },
  nightstand: { s: '#B45309', b: '#FFFBEB', f: '#FCD34D' },
  toilet:     { s: '#3B82F6', b: '#EFF6FF', f: '#BFDBFE' },
  shower:     { s: '#0EA5E9', b: '#E0F2FE', f: '#7DD3FC' },
  mirror:     { s: '#6366F1', b: '#EEF2FF', f: '#C7D2FE' },
  towel:      { s: '#EC4899', b: '#FDF2F8', f: '#FBCFE8' },
  drain:      { s: '#64748B', b: '#F1F5F9', f: '#94A3B8' },
  bathmat:    { s: '#14B8A6', b: '#F0FDFA', f: '#99F6E4' },
  showerhead: { s: '#0284C7', b: '#E0F2FE', f: '#7DD3FC' },
  toothbrush: { s: '#10B981', b: '#ECFDF5', f: '#6EE7B7' },
  grout:      { s: '#78716C', b: '#F5F5F4', f: '#D6D3D1' },
  vacuum:     { s: '#EF4444', b: '#FEF2F2', f: '#FCA5A5' },
  mop:        { s: '#3B82F6', b: '#EFF6FF', f: '#93C5FD' },
  dust:       { s: '#F59E0B', b: '#FFFBEB', f: '#FDE68A' },
  sweep:      { s: '#16A34A', b: '#F0FDF4', f: '#86EFAC' },
  window:     { s: '#0EA5E9', b: '#E0F2FE', f: '#BAE6FD' },
  curtain:    { s: '#EC4899', b: '#FDF2F8', f: '#FBCFE8' },
  lightswitch:{ s: '#F59E0B', b: '#FFFBEB', f: '#FDE68A' },
  sofa:       { s: '#16A34A', b: '#F0FDF4', f: '#BBF7D0' },
  tv:         { s: '#6366F1', b: '#EEF2FF', f: '#C7D2FE' },
  lamp:       { s: '#F59E0B', b: '#FFFBEB', f: '#FDE68A' },
  furniture:  { s: '#92400E', b: '#FFFBEB', f: '#FDE68A' },
  rug:        { s: '#DC2626', b: '#FEF2F2', f: '#FECACA' },
  desk:       { s: '#D97706', b: '#FFFBEB', f: '#FDE68A' },
  keyboard:   { s: '#64748B', b: '#F1F5F9', f: '#E2E8F0' },
  monitor:    { s: '#3B82F6', b: '#EFF6FF', f: '#BFDBFE' },
  cable:      { s: '#10B981', b: '#ECFDF5', f: '#A7F3D0' },
  chair:      { s: '#B45309', b: '#FFFBEB', f: '#FCD34D' },
  trash:      { s: '#64748B', b: '#F1F5F9', f: '#CBD5E1' },
  broom:      { s: '#16A34A', b: '#F0FDF4', f: '#BBF7D0' },
  washer:     { s: '#0EA5E9', b: '#E0F2FE', f: '#BAE6FD' },
  dryer:      { s: '#F97316', b: '#FFF7ED', f: '#FED7AA' },
  detergent:  { s: '#8B5CF6', b: '#F5F3FF', f: '#DDD6FE' },
  iron:       { s: '#6366F1', b: '#EEF2FF', f: '#A5B4FC' },
  clothes:    { s: '#EC4899', b: '#FDF2F8', f: '#FBCFE8' },
  tools:      { s: '#64748B', b: '#F1F5F9', f: '#CBD5E1' },
  cobweb:     { s: '#7C3AED', b: '#F5F3FF', f: '#DDD6FE' },
  chemicals:  { s: '#EF4444', b: '#FEF2F2', f: '#FCA5A5' },
  garagedoor: { s: '#78716C', b: '#F5F5F4', f: '#D6D3D1' },
  shelf:      { s: '#D97706', b: '#FFFBEB', f: '#FDE68A' },
  drawer:     { s: '#92400E', b: '#FEF3C7', f: '#FDE68A' },
  closet:     { s: '#A78BFA', b: '#F5F3FF', f: '#DDD6FE' },
};

function I({ k, size }: { k: string; size: number }) {
  const p = P[k] || P.sparkle;
  const w = 1.4;
  switch (k) {
    // ===== KITCHEN =====
    case 'dishes': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="13.5" rx="7" ry="4.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <ellipse cx="12" cy="12" rx="5" ry="3" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <path d="M8.5 10C9 8.5 10.5 7.5 12 7.5C13.5 7.5 15 8.5 15.5 10" stroke={p.s} strokeWidth="1" fill="none"/>
        {/* kawaii face */}
        <circle cx="10.5" cy="12.5" r="0.6" fill={p.s}/>
        <circle cx="13.5" cy="12.5" r="0.6" fill={p.s}/>
        <path d="M11 13.8C11.3 14.2 12.7 14.2 13 13.8" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
        {/* bubbles */}
        <circle cx="17" cy="8" r="1.2" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <circle cx="18.5" cy="6.5" r="0.8" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
      </svg>
    );
    case 'sink': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M5 11H19V15C19 17.2 17.2 19 15 19H9C6.8 19 5 17.2 5 15V11Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M12 5V8" stroke={p.s} strokeWidth={w} strokeLinecap="round"/>
        <path d="M12 8C12 8 10 9 10 10.5" stroke={p.s} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
        <circle cx="10.5" cy="13.5" r="0.5" fill={p.s}/>
        <circle cx="13.5" cy="13.5" r="0.5" fill={p.s}/>
        <path d="M11.3 15C11.6 15.3 12.4 15.3 12.7 15" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
        <circle cx="8" cy="9" r="0.8" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
        <circle cx="16" cy="8.5" r="0.6" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
      </svg>
    );
    case 'stove': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="8" width="16" height="12" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <circle cx="8.5" cy="14" r="2.5" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <circle cx="15.5" cy="14" r="2.5" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <circle cx="8.5" cy="14" r="0.8" fill={p.b} stroke={p.s} strokeWidth="0.7"/>
        <circle cx="15.5" cy="14" r="0.8" fill={p.b} stroke={p.s} strokeWidth="0.7"/>
        {/* steam */}
        <path d="M9 6.5C9 5.5 8.5 5 8.5 4" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
        <path d="M12 6C12 5 11.5 4.5 11.5 3.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
        <path d="M15 6.5C15 5.5 14.5 5 14.5 4" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      </svg>
    );
    case 'counter': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="10" width="18" height="3" rx="1.2" fill={p.f} stroke={p.s} strokeWidth={w}/>
        <rect x="4.5" y="13" width="5" height="7" rx="1" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        <rect x="14.5" y="13" width="5" height="7" rx="1" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        <circle cx="7" cy="16.5" r="0.6" fill={p.s}/>
        <circle cx="17" cy="16.5" r="0.6" fill={p.s}/>
        {/* sparkle on counter */}
        <path d="M12 7L12.6 8.4L14 9L12.6 9.6L12 11L11.4 9.6L10 9L11.4 8.4L12 7Z" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
      </svg>
    );
    case 'fridge': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="6" y="3" width="12" height="18" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="6" y1="10" x2="18" y2="10" stroke={p.s} strokeWidth="1.2"/>
        <line x1="15.5" y1="6" x2="15.5" y2="9" stroke={p.s} strokeWidth="1.3" strokeLinecap="round"/>
        <line x1="15.5" y1="12" x2="15.5" y2="15" stroke={p.s} strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="10" cy="6.5" r="0.5" fill={p.s}/>
        <circle cx="12.5" cy="6.5" r="0.5" fill={p.s}/>
        <path d="M10.5 8C10.8 8.3 12.2 8.3 12.5 8" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'oven': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="15" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="6.5" y="10" width="11" height="7.5" rx="1.5" fill={p.f} stroke={p.s} strokeWidth="1.2"/>
        <line x1="6.5" y1="8" x2="17.5" y2="8" stroke={p.s} strokeWidth="1"/>
        <circle cx="8" cy="6.5" r="0.7" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <circle cx="12" cy="6.5" r="0.7" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <circle cx="16" cy="6.5" r="0.7" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        {/* kawaii face on window */}
        <circle cx="10.5" cy="13" r="0.5" fill={p.s}/>
        <circle cx="13.5" cy="13" r="0.5" fill={p.s}/>
        <path d="M11 14.5C11.3 14.9 12.7 14.9 13 14.5" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'microwave': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="12" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="5" y="8" width="11" height="8" rx="1.5" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <circle cx="18" cy="10" r="0.7" fill={p.s}/>
        <circle cx="18" cy="12.5" r="0.7" fill={p.s}/>
        <circle cx="18" cy="15" r="0.7" fill={p.s}/>
        <circle cx="9" cy="11" r="0.5" fill={p.s}/>
        <circle cx="12" cy="11" r="0.5" fill={p.s}/>
        <path d="M9.5 13C9.8 13.4 11.7 13.4 12 13" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'kettle': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M7 10C7 8.3 8.3 7 10 7H14C15.7 7 17 8.3 17 10V15C17 17.2 15.2 19 13 19H11C8.8 19 7 17.2 7 15V10Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M17 11H19C19.6 11 20 11.4 20 12V13C20 13.6 19.6 14 19 14H17" stroke={p.s} strokeWidth="1.2" fill="none"/>
        <path d="M10 7V6C10 5.4 10.4 5 11 5H13C13.6 5 14 5.4 14 6V7" stroke={p.s} strokeWidth="1.2" fill="none"/>
        <circle cx="10.5" cy="12" r="0.5" fill={p.s}/>
        <circle cx="13.5" cy="12" r="0.5" fill={p.s}/>
        <path d="M11 14C11.3 14.3 12.7 14.3 13 14" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
        {/* steam */}
        <path d="M11 4C11 3 10.5 2.5 10.5 2" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" opacity="0.4"/>
        <path d="M13 4C13 3 13.5 2.5 13.5 2" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" opacity="0.4"/>
      </svg>
    );
    case 'rangehood': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 12H20V16C20 17.1 19.1 18 18 18H6C4.9 18 4 17.1 4 16V12Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M6 12L8 6H16L18 12" stroke={p.s} strokeWidth="1.2" fill={p.f}/>
        <rect x="7" y="14" width="10" height="2" rx="0.8" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <circle cx="12" cy="9" r="0.5" fill={p.s}/>
      </svg>
    );
    case 'pantry': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3" width="14" height="18" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="5" y1="8" x2="19" y2="8" stroke={p.s} strokeWidth="1"/>
        <line x1="5" y1="13" x2="19" y2="13" stroke={p.s} strokeWidth="1"/>
        <line x1="5" y1="18" x2="19" y2="18" stroke={p.s} strokeWidth="1"/>
        {/* jars */}
        <rect x="7" y="9.5" width="2.5" height="2.5" rx="0.6" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="11" y="9.5" width="2.5" height="2.5" rx="0.6" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="15" y="9.5" width="2.5" height="2.5" rx="0.6" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="8" y="14.5" width="3.5" height="2.5" rx="0.6" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="13" y="14.5" width="3.5" height="2.5" rx="0.6" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
      </svg>
    );
    case 'cabinet': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="12" y1="4" x2="12" y2="20" stroke={p.s} strokeWidth="1.2"/>
        <circle cx="10" cy="12" r="0.8" fill={p.s}/>
        <circle cx="14" cy="12" r="0.8" fill={p.s}/>
        {/* sparkle */}
        <path d="M18 5L18.5 6.2L19.7 6.7L18.5 7.2L18 8.4L17.5 7.2L16.3 6.7L17.5 6.2L18 5Z" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
      </svg>
    );

    // ===== BEDROOM =====
    case 'bed': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="11" width="18" height="6" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M5 11V9C5 7.9 5.9 7 7 7H17C18.1 7 19 7.9 19 9V11" stroke={p.s} strokeWidth={w}/>
        <rect x="5.5" y="7.8" width="5" height="3" rx="1.2" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <rect x="13.5" y="7.8" width="5" height="3" rx="1.2" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <path d="M4 17V19M20 17V19" stroke={p.s} strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10 14.5Q12 15.5 14 14.5" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none" opacity="0.5"/>
      </svg>
    );
    case 'pillow': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="12" rx="8" ry="5.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <ellipse cx="12" cy="12" rx="5.5" ry="3.5" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <circle cx="10" cy="11.5" r="0.5" fill={p.s}/>
        <circle cx="14" cy="11.5" r="0.5" fill={p.s}/>
        <path d="M11 13C11.3 13.3 12.7 13.3 13 13" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
        <path d="M6 10.5Q4.5 12 6 13.5" stroke={p.s} strokeWidth="0.7" fill="none" opacity="0.4"/>
        <path d="M18 10.5Q19.5 12 18 13.5" stroke={p.s} strokeWidth="0.7" fill="none" opacity="0.4"/>
      </svg>
    );
    case 'sheets': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="6" width="16" height="14" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M4 10C8 8 16 14 20 10" stroke={p.s} strokeWidth="1" fill="none" opacity="0.4"/>
        <path d="M4 14C8 12 16 18 20 14" stroke={p.s} strokeWidth="1" fill="none" opacity="0.3"/>
        <path d="M7 6V4.5C7 4 7.4 3.5 8 3.5H10C10.6 3.5 11 4 11 4.5V6" stroke={p.s} strokeWidth="1" fill="none"/>
        <circle cx="14" cy="11" r="0.5" fill={p.s}/>
        <circle cx="17" cy="11" r="0.5" fill={p.s}/>
        <path d="M14.5 12.5C14.8 12.8 16.7 12.8 17 12.5" stroke={p.s} strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'mattress': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="8" width="18" height="10" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="3" y1="12" x2="21" y2="12" stroke={p.s} strokeWidth="0.8" opacity="0.4"/>
        <path d="M7 12V8.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
        <path d="M12 12V8.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
        <path d="M17 12V8.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
        {/* flip arrows */}
        <path d="M8 5L12 3L16 5" stroke={p.s} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
        <path d="M8 21L12 19L16 21" stroke={p.s} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'nightstand': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="6" width="14" height="14" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="5" y1="13" x2="19" y2="13" stroke={p.s} strokeWidth="1"/>
        <circle cx="12" cy="9.5" r="0.8" fill={p.s}/>
        <circle cx="12" cy="16.5" r="0.8" fill={p.s}/>
        {/* lamp on top */}
        <path d="M12 6V4" stroke={p.s} strokeWidth="1" strokeLinecap="round"/>
        <path d="M9.5 4H14.5" stroke={p.f} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );

    // ===== BATHROOM =====
    case 'toilet': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="15" rx="5" ry="4.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="8" y="4" width="8" height="8" rx="2" fill={p.f} stroke={p.s} strokeWidth="1.2"/>
        <path d="M9 4.5H15" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="10.5" cy="14" r="0.5" fill={p.s}/>
        <circle cx="13.5" cy="14" r="0.5" fill={p.s}/>
        <path d="M11 16C11.3 16.3 12.7 16.3 13 16" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
        {/* sparkle */}
        <path d="M17.5 6L18 7L19 7.5L18 8L17.5 9L17 8L16 7.5L17 7L17.5 6Z" fill={p.f} stroke={p.s} strokeWidth="0.4"/>
      </svg>
    );
    case 'shower': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M8 4H10V8H18V20H6V8H8V4Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <circle cx="14" cy="13" r="0.5" fill={p.s}/>
        <circle cx="10" cy="13" r="0.5" fill={p.s}/>
        <path d="M10.5 15C10.8 15.4 13.2 15.4 13.5 15" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" fill="none"/>
        {/* water drops */}
        <circle cx="15" cy="6" r="0.7" fill={p.f}/>
        <circle cx="17" cy="7.5" r="0.5" fill={p.f}/>
        <circle cx="16" cy="4.5" r="0.5" fill={p.f}/>
      </svg>
    );
    case 'mirror': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="11" rx="6" ry="7" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <ellipse cx="12" cy="10.5" rx="4" ry="5" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <rect x="10.5" y="18" width="3" height="2" rx="0.8" fill={p.b} stroke={p.s} strokeWidth="1"/>
        {/* shine */}
        <path d="M9 7.5C9.5 7 10.5 6.5 11 6.5" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
      </svg>
    );
    case 'towel': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M6 5H18" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
        <rect x="8" y="5" width="8" height="14" rx="1.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M8 19C8 19 10 20.5 12 19C14 17.5 16 19 16 19" stroke={p.s} strokeWidth="1" fill="none"/>
        <line x1="10" y1="8" x2="10" y2="16" stroke={p.f} strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
        <line x1="14" y1="8" x2="14" y2="16" stroke={p.f} strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
      </svg>
    );
    case 'drain': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="7" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <circle cx="12" cy="12" r="4" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <circle cx="12" cy="12" r="1.2" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
        <line x1="12" y1="8" x2="12" y2="5.5" stroke={p.s} strokeWidth="0.8"/>
        <line x1="15.5" y1="10" x2="17.5" y2="8.5" stroke={p.s} strokeWidth="0.8"/>
        <line x1="15.5" y1="14" x2="17.5" y2="15.5" stroke={p.s} strokeWidth="0.8"/>
        <line x1="8.5" y1="10" x2="6.5" y2="8.5" stroke={p.s} strokeWidth="0.8"/>
        <line x1="8.5" y1="14" x2="6.5" y2="15.5" stroke={p.s} strokeWidth="0.8"/>
        <line x1="12" y1="16" x2="12" y2="18.5" stroke={p.s} strokeWidth="0.8"/>
      </svg>
    );
    case 'bathmat': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="8" width="16" height="10" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="6" y="10" width="12" height="6" rx="1.5" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <path d="M8 12H16M8 14H16" stroke={p.s} strokeWidth="0.7" opacity="0.3"/>
        {/* tassels */}
        <path d="M6.5 18V20M8.5 18V20M10.5 18V20M12.5 18V20M14.5 18V20M16.5 18V20" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
      </svg>
    );
    case 'showerhead': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M16 8H19V6" stroke={p.s} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
        {/* water drops */}
        <circle cx="10" cy="14" r="0.8" fill={p.f}/>
        <circle cx="12" cy="15" r="0.8" fill={p.f}/>
        <circle cx="14" cy="14" r="0.8" fill={p.f}/>
        <circle cx="11" cy="17" r="0.6" fill={p.f} opacity="0.7"/>
        <circle cx="13" cy="17.5" r="0.6" fill={p.f} opacity="0.7"/>
        <circle cx="10.5" cy="19.5" r="0.5" fill={p.f} opacity="0.4"/>
        <circle cx="13.5" cy="19" r="0.5" fill={p.f} opacity="0.4"/>
        {/* face */}
        <circle cx="10.5" cy="7.5" r="0.5" fill={p.s}/>
        <circle cx="13.5" cy="7.5" r="0.5" fill={p.s}/>
        <path d="M11 9C11.3 9.3 12.7 9.3 13 9" stroke={p.s} strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'toothbrush': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="11" y="3" width="2.5" height="14" rx="1.2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="9" y="3" width="6.5" height="4" rx="1.5" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <path d="M10 4V6M11.5 4V6.5M13 4V6M14.5 4V5.5" stroke="white" strokeWidth="0.7" strokeLinecap="round" opacity="0.6"/>
        {/* sparkles */}
        <path d="M17 5L17.5 6L18.5 6.5L17.5 7L17 8L16.5 7L15.5 6.5L16.5 6L17 5Z" fill={p.f} stroke={p.s} strokeWidth="0.4"/>
        <path d="M7 8L7.3 9L8.3 9.3L7.3 9.6L7 10.6L6.7 9.6L5.7 9.3L6.7 9L7 8Z" fill={p.f} stroke={p.s} strokeWidth="0.3"/>
      </svg>
    );
    case 'grout': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* tiles */}
        <rect x="3" y="3" width="8" height="8" rx="1" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        <rect x="13" y="3" width="8" height="8" rx="1" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        <rect x="3" y="13" width="8" height="8" rx="1" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        <rect x="13" y="13" width="8" height="8" rx="1" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        {/* grout lines highlighted */}
        <line x1="12" y1="3" x2="12" y2="21" stroke={p.f} strokeWidth="2"/>
        <line x1="3" y1="12" x2="21" y2="12" stroke={p.f} strokeWidth="2"/>
        {/* brush */}
        <path d="M17 15L19 17" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M19 17L21 19" stroke={p.s} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );

    // ===== CLEANING =====
    case 'vacuum': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="10" cy="16" r="4.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <circle cx="10" cy="16" r="2" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <path d="M13 12L17 5" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M15 6H19" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="9" cy="15.5" r="0.4" fill={p.s}/>
        <circle cx="11" cy="15.5" r="0.4" fill={p.s}/>
        <path d="M9.5 17C9.7 17.3 10.3 17.3 10.5 17" stroke={p.s} strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'mop': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <line x1="12" y1="3" x2="12" y2="14" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
        <rect x="7" y="14" width="10" height="6" rx="1.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M7.5 16H16.5M7.5 18H16.5" stroke={p.f} strokeWidth="1.5" strokeLinecap="round"/>
        {/* water drops */}
        <circle cx="8" cy="21.5" r="0.6" fill={p.f} opacity="0.6"/>
        <circle cx="12" cy="22" r="0.6" fill={p.f} opacity="0.6"/>
        <circle cx="16" cy="21.5" r="0.6" fill={p.f} opacity="0.6"/>
      </svg>
    );
    case 'dust': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* feather duster */}
        <path d="M15 16L19 20" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
        <ellipse cx="12" cy="12" rx="6" ry="5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M8 10C9 8.5 11 8 12 8C14 8 16 9 16.5 11" stroke={p.f} strokeWidth="2" strokeLinecap="round" fill="none"/>
        <path d="M9 12C10 11 13 10.5 15 12" stroke={p.f} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        {/* sparkles */}
        <path d="M5 6L5.5 7L6.5 7.5L5.5 8L5 9L4.5 8L3.5 7.5L4.5 7L5 6Z" fill={p.f} stroke={p.s} strokeWidth="0.4"/>
        <path d="M18 4L18.3 5L19.3 5.3L18.3 5.6L18 6.6L17.7 5.6L16.7 5.3L17.7 5L18 4Z" fill={p.f} stroke={p.s} strokeWidth="0.3"/>
      </svg>
    );
    case 'sweep': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <line x1="14" y1="3" x2="11" y2="13" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M7 13H17L16 19H8L7 13Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="9.5" y1="14" x2="9.5" y2="18" stroke={p.s} strokeWidth="0.6" opacity="0.3"/>
        <line x1="12" y1="14" x2="12" y2="18" stroke={p.s} strokeWidth="0.6" opacity="0.3"/>
        <line x1="14.5" y1="14" x2="14.5" y2="18" stroke={p.s} strokeWidth="0.6" opacity="0.3"/>
        {/* dust cloud */}
        <circle cx="5" cy="17" r="1.2" fill={p.f} opacity="0.5"/>
        <circle cx="4" cy="15.5" r="0.8" fill={p.f} opacity="0.4"/>
        <circle cx="3.5" cy="18" r="0.6" fill={p.f} opacity="0.3"/>
      </svg>
    );

    // ===== WINDOWS & SWITCHES =====
    case 'window': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="12" y1="4" x2="12" y2="20" stroke={p.s} strokeWidth="1.2"/>
        <line x1="4" y1="12" x2="20" y2="12" stroke={p.s} strokeWidth="1.2"/>
        {/* shine */}
        <path d="M6.5 6.5L8.5 8.5" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
        {/* sparkle */}
        <path d="M17 6L17.5 7L18.5 7.5L17.5 8L17 9L16.5 8L15.5 7.5L16.5 7L17 6Z" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
      </svg>
    );
    case 'curtain': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 4H20" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M5 4C5 4 4 12 7 16V20" stroke={p.s} strokeWidth={w} fill="none"/>
        <path d="M5 4V16C5 16 4.5 14 5.5 12C6.5 10 7 8 7 4" fill={p.b} stroke={p.s} strokeWidth="1"/>
        <path d="M19 4C19 4 20 12 17 16V20" stroke={p.s} strokeWidth={w} fill="none"/>
        <path d="M19 4V16C19 16 19.5 14 18.5 12C17.5 10 17 8 17 4" fill={p.b} stroke={p.s} strokeWidth="1"/>
        {/* tie-backs */}
        <ellipse cx="6.5" cy="13" rx="1.5" ry="0.8" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <ellipse cx="17.5" cy="13" rx="1.5" ry="0.8" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        {/* window behind */}
        <rect x="9" y="6" width="6" height="10" rx="0.5" fill={p.f} opacity="0.3"/>
      </svg>
    );
    case 'lightswitch': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="6" y="4" width="12" height="16" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="9" y="8" width="6" height="8" rx="1.5" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <rect x="10.5" y="9" width="3" height="3" rx="0.8" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
        {/* light rays */}
        <path d="M3.5 8L5 9" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.4"/>
        <path d="M3 12H5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.4"/>
        <path d="M20.5 8L19 9" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.4"/>
        <path d="M21 12H19" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.4"/>
      </svg>
    );

    // ===== LIVING ROOM =====
    case 'sofa': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="10" width="16" height="6" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M3 12C3 11 3.8 10 4.8 10V16H3V12Z" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <path d="M21 12C21 11 20.2 10 19.2 10V16H21V12Z" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <rect x="6.5" y="8.5" width="4.5" height="2" rx="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <rect x="13" y="8.5" width="4.5" height="2" rx="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <path d="M5 16V18.5M19 16V18.5" stroke={p.s} strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="10" cy="12.5" r="0.4" fill={p.s}/>
        <circle cx="14" cy="12.5" r="0.4" fill={p.s}/>
        <path d="M11 14C11.3 14.3 12.7 14.3 13 14" stroke={p.s} strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'tv': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="12" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="5" y="7" width="14" height="8" rx="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <path d="M9 17V19H15V17" stroke={p.s} strokeWidth="1.2"/>
        <path d="M7 19H17" stroke={p.s} strokeWidth="1.2" strokeLinecap="round"/>
        {/* screen shine */}
        <path d="M7 9L9 11" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      </svg>
    );
    case 'lamp': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M8 14H16L14 5H10L8 14Z" fill={p.f} stroke={p.s} strokeWidth={w}/>
        <line x1="12" y1="14" x2="12" y2="19" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M9 19H15" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        {/* warm glow */}
        <circle cx="12" cy="9" r="5" fill={p.f} opacity="0.15"/>
        {/* rays */}
        <path d="M6 8H4M18 8H20M6.5 4.5L5 3M17.5 4.5L19 3" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
    case 'furniture': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="6" width="16" height="12" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="6" y="8" width="5" height="8" rx="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <rect x="13" y="8" width="5" height="8" rx="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <circle cx="8.5" cy="12" r="0.6" fill={p.s}/>
        <circle cx="15.5" cy="12" r="0.6" fill={p.s}/>
        <path d="M5 18V20M19 18V20" stroke={p.s} strokeWidth="1.2" strokeLinecap="round"/>
        {/* sparkle */}
        <path d="M20 4L20.4 5L21.4 5.4L20.4 5.8L20 6.8L19.6 5.8L18.6 5.4L19.6 5L20 4Z" fill={p.f} stroke={p.s} strokeWidth="0.3"/>
      </svg>
    );
    case 'rug': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="7" width="16" height="11" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="6" y="9" width="12" height="7" rx="1.5" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <path d="M8 11.5H16M8 13.5H16" stroke={p.s} strokeWidth="0.7" opacity="0.3"/>
        {/* tassels */}
        <path d="M7 18V20M9 18V20M11 18V20M13 18V20M15 18V20M17 18V20" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
        <path d="M7 7V5M9 7V5M11 7V5M13 7V5M15 7V5M17 7V5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
      </svg>
    );

    // ===== OFFICE =====
    case 'desk': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="9" width="18" height="3" rx="1" fill={p.f} stroke={p.s} strokeWidth={w}/>
        <path d="M5 12V19M19 12V19" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="6" y="13" width="5" height="4" rx="1" fill={p.b} stroke={p.s} strokeWidth="1"/>
        <circle cx="8.5" cy="15" r="0.5" fill={p.s}/>
        {/* items on desk */}
        <rect x="8" y="6" width="3" height="3" rx="0.5" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
        <path d="M14 8H17" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
        <path d="M14 6.5H16" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      </svg>
    );
    case 'keyboard': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="8" width="20" height="9" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        {/* keys */}
        <rect x="4.5" y="10" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="7.5" y="10" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="10.5" y="10" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="13.5" y="10" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="16.5" y="10" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="5.5" y="13" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="8.5" y="13" width="7" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <rect x="16.5" y="13" width="2" height="2" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
      </svg>
    );
    case 'monitor': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="12" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="5" y="6" width="14" height="8" rx="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <path d="M10.5 16V18.5H13.5V16" stroke={p.s} strokeWidth="1.2"/>
        <path d="M8 19H16" stroke={p.s} strokeWidth="1.3" strokeLinecap="round"/>
        {/* screen face */}
        <circle cx="10" cy="10" r="0.5" fill={p.s}/>
        <circle cx="14" cy="10" r="0.5" fill={p.s}/>
        <path d="M10.5 11.5C10.8 11.9 13.2 11.9 13.5 11.5" stroke={p.s} strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      </svg>
    );
    case 'cable': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M5 5C5 5 7 8 7 12C7 16 5 19 5 19" stroke={p.s} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M10 4C10 4 13 8 13 12C13 16 10 20 10 20" stroke={p.f} strokeWidth="2" strokeLinecap="round" fill="none"/>
        <path d="M16 5C16 5 18 8 18 12C18 16 16 19 16 19" stroke={p.s} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        {/* plug */}
        <rect x="18" y="10" width="3" height="4" rx="1" fill={p.b} stroke={p.s} strokeWidth="1"/>
        <line x1="21" y1="11" x2="22.5" y2="11" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
        <line x1="21" y1="13" x2="22.5" y2="13" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
      </svg>
    );
    case 'chair': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="7" y="5" width="10" height="10" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="6" y="15" width="12" height="3" rx="1.2" fill={p.f} stroke={p.s} strokeWidth="1.2"/>
        <path d="M8 18V20.5M16 18V20.5" stroke={p.s} strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M6 8H5V14H6M18 8H19V14H18" stroke={p.s} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      </svg>
    );

    // ===== TRASH & BROOM =====
    case 'trash': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="6" y="8" width="12" height="11" rx="2.5" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M5 8H19" stroke={p.s} strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M9 6H15" stroke={p.s} strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M10 11V16M14 11V16" stroke={p.s} strokeWidth="1.1" strokeLinecap="round"/>
        {/* face */}
        <circle cx="10" cy="12" r="0.4" fill={p.s}/>
        <circle cx="14" cy="12" r="0.4" fill={p.s}/>
      </svg>
    );
    case 'broom': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <line x1="15" y1="3" x2="12" y2="13" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8 13H16L15 20H9L8 13Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="10" y1="14" x2="10" y2="19" stroke={p.s} strokeWidth="0.5" opacity="0.3"/>
        <line x1="12" y1="14" x2="12" y2="19" stroke={p.s} strokeWidth="0.5" opacity="0.3"/>
        <line x1="14" y1="14" x2="14" y2="19" stroke={p.s} strokeWidth="0.5" opacity="0.3"/>
        {/* sparkle */}
        <path d="M5 8L5.5 9.2L6.7 9.7L5.5 10.2L5 11.4L4.5 10.2L3.3 9.7L4.5 9.2L5 8Z" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
      </svg>
    );

    // ===== LAUNDRY =====
    case 'washer': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="3" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <circle cx="12" cy="13.5" r="5" fill={p.f} stroke={p.s} strokeWidth="1.2"/>
        <path d="M9 13C10 11.5 12.5 11 14 12.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none"/>
        <path d="M10 14.5C11 13 13.5 13.5 14.5 15" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none"/>
        <circle cx="7" cy="6" r="0.8" fill={p.s}/>
        <circle cx="10" cy="6" r="0.8" fill={p.s}/>
        <rect x="14" y="5.5" width="4" height="1.2" rx="0.6" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
      </svg>
    );
    case 'dryer': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="3" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <circle cx="12" cy="13.5" r="5" fill={p.f} stroke={p.s} strokeWidth="1.2"/>
        <circle cx="12" cy="13.5" r="2.5" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
        <circle cx="7" cy="6" r="0.8" fill={p.s}/>
        <circle cx="10" cy="6" r="0.8" fill={p.s}/>
        {/* heat waves */}
        <path d="M11 12C11.3 11.5 11.7 12 12 11.5" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" opacity="0.5"/>
        <path d="M12 14C12.3 13.5 12.7 14 13 13.5" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" opacity="0.5"/>
      </svg>
    );
    case 'detergent': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="7" y="7" width="10" height="13" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <rect x="9" y="4" width="4" height="4" rx="1" fill={p.f} stroke={p.s} strokeWidth="1"/>
        <path d="M13 5.5H15.5C16 5.5 16.5 6 16.5 6.5V7" stroke={p.s} strokeWidth="1" fill="none"/>
        {/* label */}
        <rect x="9" y="11" width="6" height="4" rx="0.8" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        {/* bubbles */}
        <circle cx="17" cy="10" r="1" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
        <circle cx="18.5" cy="8" r="0.7" fill={p.f} stroke={p.s} strokeWidth="0.4"/>
      </svg>
    );
    case 'iron': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 16H20L18 10H8L4 16Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <path d="M8 10V7C8 6 9 5 10 5H14" stroke={p.s} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
        <path d="M14 5H16C17 5 18 6 18 7V10" stroke={p.s} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
        <path d="M6 16H18V17.5C18 18.3 17.3 19 16.5 19H7.5C6.7 19 6 18.3 6 17.5V16Z" fill={p.f} stroke={p.s} strokeWidth="1"/>
        {/* steam */}
        <path d="M10 3C10 2 9.5 1.5 9.5 1" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" opacity="0.4"/>
        <path d="M13 3.5C13 2.5 12.5 2 12.5 1" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" opacity="0.4"/>
      </svg>
    );
    case 'clothes': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* t-shirt shape */}
        <path d="M8 4L6 4L3 8L6 9L6 19H18V9L21 8L18 4L16 4" stroke={p.s} strokeWidth={w} fill={p.b}/>
        <path d="M8 4C8 4 9 6 12 6C15 6 16 4 16 4" stroke={p.s} strokeWidth="1.2" fill="none"/>
        {/* collar */}
        <path d="M10 5C10.5 6.5 13.5 6.5 14 5" stroke={p.f} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        {/* heart on shirt */}
        <path d="M12 14L10.5 12.5C10 12 10 11.2 10.5 10.7C11 10.2 11.5 10.2 12 10.7C12.5 10.2 13 10.2 13.5 10.7C14 11.2 14 12 13.5 12.5L12 14Z" fill={p.f}/>
      </svg>
    );

    // ===== GARAGE =====
    case 'tools': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* wrench */}
        <path d="M6 17L13 10" stroke={p.s} strokeWidth="2" strokeLinecap="round"/>
        <path d="M14 5C14 5 16 4 18 6C20 8 19 10 19 10L16 7L14 9L17 12C17 12 14 13 12 11C10 9 11 6 11 6" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        {/* screwdriver */}
        <path d="M5 19L9 15" stroke={p.s} strokeWidth="2" strokeLinecap="round"/>
        <circle cx="5" cy="19" r="1.5" fill={p.f} stroke={p.s} strokeWidth="1"/>
      </svg>
    );
    case 'cobweb': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 4L20 20M4 12H20M12 4V20M4 20L20 4" stroke={p.s} strokeWidth="0.8" opacity="0.3"/>
        <path d="M8 8C9 7 11 6.5 12 6.5C13 6.5 15 7 16 8" stroke={p.s} strokeWidth="0.8" fill="none"/>
        <path d="M6 12C7 10 9.5 8.5 12 8.5C14.5 8.5 17 10 18 12" stroke={p.s} strokeWidth="0.8" fill="none"/>
        <path d="M5 16C7 13 9 11.5 12 11.5C15 11.5 17 13 19 16" stroke={p.s} strokeWidth="0.8" fill="none"/>
        {/* spider */}
        <circle cx="12" cy="12" r="1.5" fill={p.b} stroke={p.s} strokeWidth="1"/>
        <circle cx="12" cy="11" r="1" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <circle cx="11.5" cy="10.8" r="0.3" fill={p.s}/>
        <circle cx="12.5" cy="10.8" r="0.3" fill={p.s}/>
      </svg>
    );
    case 'chemicals': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M9 4H15V9L18 17C18.3 18 17.5 19 16.5 19H7.5C6.5 19 5.7 18 6 17L9 9V4Z" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="9" y1="4" x2="15" y2="4" stroke={p.s} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 14H16" stroke={p.f} strokeWidth="1.5"/>
        <circle cx="10" cy="16" r="0.8" fill={p.f}/>
        <circle cx="13" cy="15.5" r="1" fill={p.f}/>
        <circle cx="14.5" cy="17" r="0.6" fill={p.f}/>
        {/* warning */}
        <path d="M11.5 8L12 6.5L12.5 8" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
      </svg>
    );
    case 'garagedoor': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="15" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="3" y1="8" x2="21" y2="8" stroke={p.s} strokeWidth="0.8"/>
        <line x1="3" y1="11" x2="21" y2="11" stroke={p.s} strokeWidth="0.8"/>
        <line x1="3" y1="14" x2="21" y2="14" stroke={p.s} strokeWidth="0.8"/>
        <line x1="3" y1="17" x2="21" y2="17" stroke={p.s} strokeWidth="0.8"/>
        <circle cx="18" cy="14" r="0.8" fill={p.s}/>
        {/* sparkle */}
        <path d="M18 3L18.4 4L19.4 4.4L18.4 4.8L18 5.8L17.6 4.8L16.6 4.4L17.6 4L18 3Z" fill={p.f} stroke={p.s} strokeWidth="0.3"/>
      </svg>
    );

    // ===== ORGANIZE =====
    case 'shelf': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="1.5" fill="none" stroke={p.s} strokeWidth={w}/>
        <line x1="4" y1="10" x2="20" y2="10" stroke={p.s} strokeWidth="1.2"/>
        <line x1="4" y1="17" x2="20" y2="17" stroke={p.s} strokeWidth="1.2"/>
        {/* items */}
        <rect x="6" y="5" width="3" height="5" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="10" y="6" width="3" height="4" rx="0.5" fill={p.b} stroke={p.s} strokeWidth="0.7"/>
        <rect x="14" y="5.5" width="4" height="4.5" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="6" y="12" width="4" height="5" rx="0.5" fill={p.b} stroke={p.s} strokeWidth="0.7"/>
        <rect x="12" y="12" width="3" height="5" rx="0.5" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
        <rect x="16" y="13" width="2.5" height="4" rx="0.5" fill={p.b} stroke={p.s} strokeWidth="0.7"/>
      </svg>
    );
    case 'drawer': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="4" y1="10" x2="20" y2="10" stroke={p.s} strokeWidth="1.2"/>
        <line x1="4" y1="16" x2="20" y2="16" stroke={p.s} strokeWidth="1.2"/>
        <rect x="10" y="6" width="4" height="2" rx="0.8" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <rect x="10" y="12" width="4" height="2" rx="0.8" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
        <rect x="10" y="17.5" width="4" height="1.5" rx="0.8" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
      </svg>
    );
    case 'closet': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill={p.b} stroke={p.s} strokeWidth={w}/>
        <line x1="12" y1="3" x2="12" y2="21" stroke={p.s} strokeWidth="1.2"/>
        <circle cx="10.5" cy="12" r="0.7" fill={p.s}/>
        <circle cx="13.5" cy="12" r="0.7" fill={p.s}/>
        {/* hanger */}
        <path d="M7 8L9 6.5L11 8" stroke={p.f} strokeWidth="1" strokeLinecap="round" fill="none"/>
        <line x1="9" y1="6.5" x2="9" y2="5.5" stroke={p.f} strokeWidth="0.8"/>
        <path d="M13 8L15 6.5L17 8" stroke={p.f} strokeWidth="1" strokeLinecap="round" fill="none"/>
        <line x1="15" y1="6.5" x2="15" y2="5.5" stroke={p.f} strokeWidth="0.8"/>
      </svg>
    );

    // ===== DEFAULT =====
    default: return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 4L13.8 9.5L19.5 11L13.8 12.5L12 18L10.2 12.5L4.5 11L10.2 9.5L12 4Z" fill={p.b} stroke={p.s} strokeWidth="1.2"/>
        <path d="M18.5 4.5L19 6L20.5 6.5L19 7L18.5 8.5L18 7L16.5 6.5L18 6L18.5 4.5Z" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
        <path d="M6 16L6.3 17L7.3 17.3L6.3 17.6L6 18.6L5.7 17.6L4.7 17.3L5.7 17L6 16Z" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
      </svg>
    );
  }
}

export function TaskIcon({ iconKey, size = 14 }: { iconKey?: string | null; size?: number }) {
  const k = iconKey || 'sparkle';
  // The family-activity icons (pets, yard, school…) live in TaskIconsExtra.tsx
  return EXTRA_KEYS.has(k) ? <ExtraIcon k={k} size={size} /> : <I k={k} size={size} />;
}
