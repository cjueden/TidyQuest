/* eslint-disable react-refresh/only-export-components */
import type { JSX, ReactNode } from 'react';

export type ExtraIconKey =
  | 'dog' | 'cat' | 'petfood' | 'litter' | 'poop' | 'leash' | 'petbed' | 'petmeds' | 'fishtank'
  | 'mower' | 'rake' | 'wateringcan' | 'plant' | 'pool' | 'skimmer' | 'hose' | 'shovel' | 'weeds'
  | 'car' | 'carwash' | 'bike'
  | 'smokealarm' | 'extinguisher' | 'airfilter' | 'waterfilter' | 'battery' | 'lightbulb' | 'recycling' | 'mail'
  | 'groceries' | 'cart' | 'bills' | 'piggybank' | 'calendar'
  | 'cooking' | 'lunchbox' | 'table'
  | 'folding' | 'hanger'
  | 'homework' | 'backpack' | 'reportcard' | 'bus' | 'alarmclock' | 'bedtime' | 'hairbrush' | 'shoes' | 'toys' | 'reading'
  | 'briefcase' | 'phone'
  | 'trophy' | 'star' | 'streak' | 'medal' | 'heart';

type Group = 'pets' | 'yard' | 'car' | 'upkeep' | 'errands' | 'cooking' | 'laundry' | 'school' | 'work' | 'wins';

export const EXTRA_ICON_OPTIONS: Array<{ key: ExtraIconKey; label: string; group: Group }> = [
  { key: 'dog', label: 'Dog', group: 'pets' },
  { key: 'cat', label: 'Cat', group: 'pets' },
  { key: 'petfood', label: 'Pet Food Bowl', group: 'pets' },
  { key: 'litter', label: 'Litter Box', group: 'pets' },
  { key: 'poop', label: 'Poop Scoop', group: 'pets' },
  { key: 'leash', label: 'Dog Walk', group: 'pets' },
  { key: 'petbed', label: 'Pet Bed', group: 'pets' },
  { key: 'petmeds', label: 'Pet Meds', group: 'pets' },
  { key: 'fishtank', label: 'Fish Tank', group: 'pets' },
  { key: 'mower', label: 'Lawn Mower', group: 'yard' },
  { key: 'rake', label: 'Leaves & Rake', group: 'yard' },
  { key: 'wateringcan', label: 'Watering Can', group: 'yard' },
  { key: 'plant', label: 'Potted Plant', group: 'yard' },
  { key: 'pool', label: 'Pool', group: 'yard' },
  { key: 'skimmer', label: 'Pool Skimmer', group: 'yard' },
  { key: 'hose', label: 'Garden Hose', group: 'yard' },
  { key: 'shovel', label: 'Snow Shovel', group: 'yard' },
  { key: 'weeds', label: 'Weeding', group: 'yard' },
  { key: 'car', label: 'Car', group: 'car' },
  { key: 'carwash', label: 'Car Wash', group: 'car' },
  { key: 'bike', label: 'Bike', group: 'car' },
  { key: 'smokealarm', label: 'Smoke Alarm', group: 'upkeep' },
  { key: 'extinguisher', label: 'Fire Extinguisher', group: 'upkeep' },
  { key: 'airfilter', label: 'Air Filter', group: 'upkeep' },
  { key: 'waterfilter', label: 'Water Filter', group: 'upkeep' },
  { key: 'battery', label: 'Battery', group: 'upkeep' },
  { key: 'lightbulb', label: 'Light Bulb', group: 'upkeep' },
  { key: 'recycling', label: 'Recycling', group: 'upkeep' },
  { key: 'mail', label: 'Mail', group: 'upkeep' },
  { key: 'groceries', label: 'Grocery Bag', group: 'errands' },
  { key: 'cart', label: 'Shopping Cart', group: 'errands' },
  { key: 'bills', label: 'Bills', group: 'errands' },
  { key: 'piggybank', label: 'Piggy Bank', group: 'errands' },
  { key: 'calendar', label: 'Calendar', group: 'errands' },
  { key: 'cooking', label: 'Cooking Pot', group: 'cooking' },
  { key: 'lunchbox', label: 'Lunch Box', group: 'cooking' },
  { key: 'table', label: 'Set the Table', group: 'cooking' },
  { key: 'folding', label: 'Folded Clothes', group: 'laundry' },
  { key: 'hanger', label: 'Hanger', group: 'laundry' },
  { key: 'homework', label: 'Homework', group: 'school' },
  { key: 'backpack', label: 'Backpack', group: 'school' },
  { key: 'reportcard', label: 'Report Card', group: 'school' },
  { key: 'bus', label: 'School Bus', group: 'school' },
  { key: 'alarmclock', label: 'Alarm Clock', group: 'school' },
  { key: 'bedtime', label: 'Bedtime', group: 'school' },
  { key: 'hairbrush', label: 'Hairbrush', group: 'school' },
  { key: 'shoes', label: 'Shoes', group: 'school' },
  { key: 'toys', label: 'Toy Box', group: 'school' },
  { key: 'reading', label: 'Reading', group: 'school' },
  { key: 'briefcase', label: 'Work', group: 'work' },
  { key: 'phone', label: 'Phone Check-in', group: 'work' },
  { key: 'trophy', label: 'Trophy', group: 'wins' },
  { key: 'star', label: 'Star', group: 'wins' },
  { key: 'streak', label: 'Streak Flame', group: 'wins' },
  { key: 'medal', label: 'Medal', group: 'wins' },
  { key: 'heart', label: 'Kindness Heart', group: 'wins' },
];

type Pal = { s: string; b: string; f: string };

export const EXTRA_ICON_PALETTES: Record<ExtraIconKey, Pal> = {
  dog:          { s: '#B45309', b: '#FFFBEB', f: '#FCD34D' },
  cat:          { s: '#F97316', b: '#FFF7ED', f: '#FDBA74' },
  petfood:      { s: '#EA580C', b: '#FFF7ED', f: '#FDBA74' },
  litter:       { s: '#0D9488', b: '#F0FDFA', f: '#99F6E4' },
  poop:         { s: '#92400E', b: '#FEF3C7', f: '#D6A36B' },
  leash:        { s: '#E11D48', b: '#FFF1F2', f: '#FDA4AF' },
  petbed:       { s: '#9333EA', b: '#FAF5FF', f: '#D8B4FE' },
  petmeds:      { s: '#DB2777', b: '#FDF2F8', f: '#F9A8D4' },
  fishtank:     { s: '#0284C7', b: '#E0F2FE', f: '#7DD3FC' },
  mower:        { s: '#16A34A', b: '#F0FDF4', f: '#86EFAC' },
  rake:         { s: '#CA8A04', b: '#FEFCE8', f: '#FDE047' },
  wateringcan:  { s: '#0EA5E9', b: '#E0F2FE', f: '#7DD3FC' },
  plant:        { s: '#15803D', b: '#ECFDF5', f: '#86EFAC' },
  pool:         { s: '#0891B2', b: '#ECFEFF', f: '#67E8F9' },
  skimmer:      { s: '#0369A1', b: '#E0F2FE', f: '#7DD3FC' },
  hose:         { s: '#059669', b: '#ECFDF5', f: '#6EE7B7' },
  shovel:       { s: '#3B82F6', b: '#EFF6FF', f: '#BFDBFE' },
  weeds:        { s: '#65A30D', b: '#F7FEE7', f: '#BEF264' },
  car:          { s: '#DC2626', b: '#FEF2F2', f: '#FCA5A5' },
  carwash:      { s: '#2563EB', b: '#EFF6FF', f: '#93C5FD' },
  bike:         { s: '#7C3AED', b: '#F5F3FF', f: '#C4B5FD' },
  smokealarm:   { s: '#64748B', b: '#F1F5F9', f: '#CBD5E1' },
  extinguisher: { s: '#DC2626', b: '#FEF2F2', f: '#FCA5A5' },
  airfilter:    { s: '#0EA5E9', b: '#F0F9FF', f: '#BAE6FD' },
  waterfilter:  { s: '#0891B2', b: '#ECFEFF', f: '#A5F3FC' },
  battery:      { s: '#16A34A', b: '#F0FDF4', f: '#86EFAC' },
  lightbulb:    { s: '#D97706', b: '#FFFBEB', f: '#FDE68A' },
  recycling:    { s: '#16A34A', b: '#F0FDF4', f: '#BBF7D0' },
  mail:         { s: '#6366F1', b: '#EEF2FF', f: '#C7D2FE' },
  groceries:    { s: '#B45309', b: '#FFFBEB', f: '#FCD34D' },
  cart:         { s: '#EA580C', b: '#FFF7ED', f: '#FED7AA' },
  bills:        { s: '#15803D', b: '#F0FDF4', f: '#86EFAC' },
  piggybank:    { s: '#EC4899', b: '#FDF2F8', f: '#F9A8D4' },
  calendar:     { s: '#EF4444', b: '#FEF2F2', f: '#FECACA' },
  cooking:      { s: '#EA580C', b: '#FFF7ED', f: '#FDBA74' },
  lunchbox:     { s: '#0D9488', b: '#F0FDFA', f: '#5EEAD4' },
  table:        { s: '#D97706', b: '#FFFBEB', f: '#FDE68A' },
  folding:      { s: '#8B5CF6', b: '#F5F3FF', f: '#DDD6FE' },
  hanger:       { s: '#6366F1', b: '#EEF2FF', f: '#A5B4FC' },
  homework:     { s: '#2563EB', b: '#EFF6FF', f: '#FDE68A' },
  backpack:     { s: '#7C3AED', b: '#F5F3FF', f: '#C4B5FD' },
  reportcard:   { s: '#16A34A', b: '#F0FDF4', f: '#FDE68A' },
  bus:          { s: '#D97706', b: '#FFFBEB', f: '#FCD34D' },
  alarmclock:   { s: '#E11D48', b: '#FFF1F2', f: '#FDA4AF' },
  bedtime:      { s: '#6366F1', b: '#EEF2FF', f: '#C7D2FE' },
  hairbrush:    { s: '#DB2777', b: '#FDF2F8', f: '#FBCFE8' },
  shoes:        { s: '#2563EB', b: '#EFF6FF', f: '#93C5FD' },
  toys:         { s: '#F97316', b: '#FFF7ED', f: '#FDBA74' },
  reading:      { s: '#7C3AED', b: '#F5F3FF', f: '#DDD6FE' },
  briefcase:    { s: '#92400E', b: '#FEF3C7', f: '#FCD34D' },
  phone:        { s: '#0EA5E9', b: '#E0F2FE', f: '#BAE6FD' },
  trophy:       { s: '#D97706', b: '#FFFBEB', f: '#FCD34D' },
  star:         { s: '#CA8A04', b: '#FEFCE8', f: '#FDE047' },
  streak:       { s: '#EA580C', b: '#FFF7ED', f: '#FDBA74' },
  medal:        { s: '#D97706', b: '#FFFBEB', f: '#FCD34D' },
  heart:        { s: '#E11D48', b: '#FFF1F2', f: '#FDA4AF' },
};

type Stroke = { stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round' };

const W = 1.4;
const mk = (p: Pal, strokeWidth: number): Stroke =>
  ({ stroke: p.s, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' });

/** tiny kawaii face: two dots and a smile */
function face(p: Pal, cx: number, cy: number, d = 1.5): ReactNode {
  return (
    <g>
      <circle cx={cx - d} cy={cy} r="0.55" fill={p.s}/>
      <circle cx={cx + d} cy={cy} r="0.55" fill={p.s}/>
      <path d={`M${cx - 0.8} ${cy + 1.4}C${cx - 0.5} ${cy + 1.8} ${cx + 0.5} ${cy + 1.8} ${cx + 0.8} ${cy + 1.4}`}
        stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
    </g>
  );
}

function starPath(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const sparkle = (p: Pal, x: number, y: number, r = 1.6): ReactNode => (
  <path d={`M${x} ${y - r}L${x + r * 0.35} ${y - r * 0.35}L${x + r} ${y}L${x + r * 0.35} ${y + r * 0.35}L${x} ${y + r}L${x - r * 0.35} ${y + r * 0.35}L${x - r} ${y}L${x - r * 0.35} ${y - r * 0.35}Z`}
    fill={p.f} stroke={p.s} strokeWidth="0.5" strokeLinejoin="round"/>
);

const carBody = (p: Pal, S: Stroke): ReactNode => (
  <g>
    <path d="M6 12L8 7.5Q8.3 7 9 7H15Q15.7 7 16 7.5L18 12Z" fill={p.f} {...S}/>
    <rect x="2.5" y="11.5" width="19" height="6.5" rx="2.2" fill={p.b} {...S}/>
    <circle cx="7" cy="18" r="2.4" fill={p.f} {...S}/>
    <circle cx="17" cy="18" r="2.4" fill={p.f} {...S}/>
    <circle cx="4.8" cy="13.8" r="0.8" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
    <circle cx="19.2" cy="13.8" r="0.8" fill={p.f} stroke={p.s} strokeWidth="0.6"/>
    {face(p, 12, 13.6, 1.5)}
  </g>
);

type Draw = (p: Pal, S: Stroke, T: Stroke) => ReactNode;

const DRAW: Record<ExtraIconKey, Draw> = {
  // ===== PETS =====
  dog: (p, S) => (<>
    <ellipse cx="5.8" cy="11.5" rx="2.5" ry="4.8" transform="rotate(12 5.8 11.5)" fill={p.f} {...S}/>
    <ellipse cx="18.2" cy="11.5" rx="2.5" ry="4.8" transform="rotate(-12 18.2 11.5)" fill={p.f} {...S}/>
    <rect x="6.5" y="5" width="11" height="14" rx="5.5" fill={p.b} {...S}/>
    <ellipse cx="12" cy="15" rx="3.6" ry="2.7" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <ellipse cx="12" cy="13.6" rx="1.3" ry="0.9" fill={p.s}/>
    <path d="M12 14.5V16M10.6 16.6Q12 17.6 12 16M12 16Q12 17.6 13.4 16.6" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
    <circle cx="9.5" cy="10.5" r="0.7" fill={p.s}/>
    <circle cx="14.5" cy="10.5" r="0.7" fill={p.s}/>
  </>),
  cat: (p, S) => (<>
    <path d="M5 11L5.5 3.8L10.2 6.6" fill={p.f} {...S}/>
    <path d="M19 11L18.5 3.8L13.8 6.6" fill={p.f} {...S}/>
    <ellipse cx="12" cy="13" rx="8" ry="6.8" fill={p.b} {...S}/>
    <circle cx="9" cy="12.2" r="0.7" fill={p.s}/>
    <circle cx="15" cy="12.2" r="0.7" fill={p.s}/>
    <path d="M11.2 14.3H12.8L12 15.2Z" fill={p.f} stroke={p.s} strokeWidth="0.6" strokeLinejoin="round"/>
    <path d="M12 15.2Q11 16.6 10 16M12 15.2Q13 16.6 14 16" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
    <path d="M3.2 13.5L6.2 14M3.4 16L6.4 15.4M20.8 13.5L17.8 14M20.6 16L17.6 15.4" stroke={p.s} strokeWidth="0.7" strokeLinecap="round"/>
  </>),
  petfood: (p, S) => (<>
    <path d="M7 12Q7.5 6.5 12 6.5Q16.5 6.5 17 12Z" fill={p.f} {...S}/>
    <circle cx="10" cy="9.5" r="0.7" fill={p.b}/>
    <circle cx="13.5" cy="8.8" r="0.7" fill={p.b}/>
    <circle cx="14.5" cy="10.8" r="0.7" fill={p.b}/>
    <path d="M3.5 12H20.5L18.6 19.3Q18.4 20.3 17.4 20.3H6.6Q5.6 20.3 5.4 19.3Z" fill={p.b} {...S}/>
    <path d="M3.5 12H20.5" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    {face(p, 12, 15.2, 2)}
    <path d="M3 7.5l1.2 1.2M21 7.5l-1.2 1.2" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
  </>),
  litter: (p, S) => (<>
    <rect x="3.5" y="12" width="17" height="8" rx="2.2" fill={p.b} {...S}/>
    <rect x="2.5" y="9" width="19" height="3.5" rx="1.5" fill={p.f} {...S}/>
    <circle cx="7" cy="10.8" r="0.5" fill={p.s}/>
    <circle cx="11" cy="10.8" r="0.5" fill={p.s}/>
    <circle cx="16.5" cy="10.8" r="0.5" fill={p.s}/>
    <path d="M7 6.5Q9 3.5 11 6.5M13 6Q15 3 17 6" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.5"/>
    {face(p, 12, 15.2, 2)}
  </>),
  poop: (p, S) => (<>
    <path d="M12 3.5Q14.5 4.5 14 7.2Q16.5 7.6 16.5 10Q19.5 10.6 19.5 14Q21 14.6 21 17.2Q21 19.5 18.5 19.5H5.5Q3 19.5 3 17.2Q3 14.6 4.5 14Q4.5 10.6 7.5 10Q7.5 7.6 10 7.2Q9.6 4.8 12 3.5Z" fill={p.f} {...S}/>
    <path d="M7.5 14.2Q12 12.4 16.5 14.2" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.4"/>
    <path d="M9.5 10.2Q12 9 14.5 10.2" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.4"/>
    <circle cx="9.5" cy="15.7" r="0.6" fill={p.s}/>
    <circle cx="14.5" cy="15.7" r="0.6" fill={p.s}/>
    <path d="M10.8 17.4Q12 18.6 13.2 17.4" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none"/>
    {sparkle(p, 19, 5.5, 1.8)}
  </>),
  leash: (p, S) => (<>
    <path d="M18 7.5C18 12 14 11 13.5 13.5" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <circle cx="18.5" cy="5.2" r="2.7" fill={p.b} {...S}/>
    <ellipse cx="11" cy="17" rx="4.6" ry="3.8" fill={p.f} {...S}/>
    <ellipse cx="4.8" cy="12.8" rx="1.7" ry="2.2" transform="rotate(-20 4.8 12.8)" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <ellipse cx="8.5" cy="9.4" rx="1.7" ry="2.3" transform="rotate(-8 8.5 9.4)" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <ellipse cx="13.9" cy="9.8" rx="1.6" ry="2.2" transform="rotate(12 13.9 9.8)" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <ellipse cx="17.6" cy="13.4" rx="1.5" ry="2.1" transform="rotate(30 17.6 13.4)" fill={p.f} stroke={p.s} strokeWidth="1"/>
    {face(p, 11, 16.4, 1.5)}
  </>),
  petbed: (p, S) => (<>
    <ellipse cx="12" cy="15" rx="9.5" ry="5.2" fill={p.f} {...S}/>
    <ellipse cx="12" cy="14" rx="6.5" ry="3" fill={p.b} stroke={p.s} strokeWidth="1"/>
    <path d="M9.5 13.6Q10.5 12.6 11.5 13.6M12.5 13.6Q13.5 12.6 14.5 13.6" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none"/>
    <path d="M11.3 14.9Q12 15.4 12.7 14.9" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
    <path d="M15.5 4.5H18.5L15.5 8H18.5" stroke={p.s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M10 6.5H12.5L10 9.3H12.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6"/>
  </>),
  petmeds: (p, S) => (<>
    <rect x="6.5" y="9" width="11" height="11.5" rx="2.2" fill={p.b} {...S}/>
    <rect x="5.8" y="4.5" width="12.4" height="4.5" rx="1.5" fill={p.f} {...S}/>
    <path d="M9 6.8H15" stroke={p.s} strokeWidth="0.7" opacity="0.4"/>
    <path d="M12 10.8V12.8M11 11.8H13" stroke={p.s} strokeWidth="0.9" strokeLinecap="round"/>
    {face(p, 12, 15.5, 2)}
  </>),
  fishtank: (p, S) => (<>
    <path d="M3 9.5H21V16.8Q21 19 18.8 19H5.2Q3 19 3 16.8Z" fill={p.f}/>
    <rect x="3" y="5.5" width="18" height="13.5" rx="2.5" fill="none" {...S}/>
    <path d="M3 9.5Q6 8.3 8 9.5T13 9.5T18 9.5T21 9.5" stroke={p.s} strokeWidth="0.8" fill="none" opacity="0.5"/>
    <path d="M13.5 14.2Q16 11 18.8 14.2Q16 17.4 13.5 14.2Z" fill={p.b} stroke={p.s} strokeWidth="1" strokeLinejoin="round"/>
    <path d="M13.5 14.2L11.5 12.4V16Z" fill={p.b} stroke={p.s} strokeWidth="1" strokeLinejoin="round"/>
    <circle cx="16.8" cy="13.6" r="0.55" fill={p.s}/>
    <path d="M7 19V15.5Q6 14 7.2 12.5M7 17Q8.3 16 8.2 14.5" stroke={p.s} strokeWidth="1" strokeLinecap="round" fill="none"/>
    <circle cx="10" cy="12" r="0.8" fill="none" stroke={p.s} strokeWidth="0.6"/>
    <circle cx="9" cy="14" r="0.5" fill="none" stroke={p.s} strokeWidth="0.5"/>
  </>),

  // ===== YARD & POOL =====
  mower: (p, S) => (<>
    <path d="M16 11L19.5 4.2H22" stroke={p.s} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <rect x="3" y="10.5" width="13.5" height="6" rx="2.6" fill={p.b} {...S}/>
    <circle cx="7" cy="18" r="2.6" fill={p.f} {...S}/>
    <circle cx="14" cy="18" r="2.6" fill={p.f} {...S}/>
    <circle cx="7" cy="18" r="0.7" fill={p.s}/>
    <circle cx="14" cy="18" r="0.7" fill={p.s}/>
    {face(p, 9.8, 13.1, 1.7)}
    <path d="M17.5 20.5L18 18.5M19.5 20.5L19.6 17.8M21.3 20.5L21 18.6" stroke={p.s} strokeWidth="0.9" strokeLinecap="round"/>
    <path d="M5 8.4L6 6.4L7 8.4" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5"/>
  </>),
  rake: (p, S) => (<>
    <path d="M17 2.8L13.5 13" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    <rect x="8" y="12.5" width="12" height="2.4" rx="1" fill={p.f} {...S}/>
    <path d="M9.5 15L9 19M12 15V19.5M14.5 15V19.5M17.5 15L18 19" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    <path d="M3.5 9.5C3.5 5.8 6.5 3.8 9 4.2C9.4 7.5 7 10.5 3.5 9.5Z" fill={p.f} {...S}/>
    <path d="M4.2 8.8L7.2 5.8" stroke={p.s} strokeWidth="0.7" strokeLinecap="round"/>
    <path d="M3 13.5C3 11.2 5 10.4 6.5 10.8C6.6 12.8 5 14.6 3 13.5Z" fill={p.b} stroke={p.s} strokeWidth="1" strokeLinejoin="round"/>
    <circle cx="5.3" cy="19.3" r="1" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
  </>),
  wateringcan: (p, S) => (<>
    <path d="M15 13.5L20 9" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    <path d="M19 7.2L22 10.2" stroke={p.s} strokeWidth="2.4" strokeLinecap="round"/>
    <path d="M7 10.5C7 5.5 13 5.5 13 10.5" stroke={p.s} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
    <path d="M5 12.5C1.5 12.5 1.5 17.5 5 17.5" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <path d="M4.5 10.5H15.5V18Q15.5 20 13.5 20H6.5Q4.5 20 4.5 18Z" fill={p.b} {...S}/>
    <path d="M4.5 10.5H15.5" stroke={p.s} strokeWidth={W}/>
    {face(p, 10, 14.5, 2)}
    <path d="M21.5 13.2V14.4M19.5 14V15.4M23 11.8V12.5" stroke={p.f} strokeWidth="1.2" strokeLinecap="round"/>
  </>),
  plant: (p, S) => (<>
    <path d="M12 12.5C11.5 8 9 6 5 5.5C4.6 9.5 7.5 12.3 12 12.5Z" fill={p.f} {...S}/>
    <path d="M12 12.5C12.6 7.5 15 4.5 19 3.8C19.6 8.3 16.6 12 12 12.5Z" fill={p.f} {...S}/>
    <path d="M12 12.5V8.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
    <rect x="5.5" y="12.5" width="13" height="3" rx="1.2" fill="#FDBA74" {...S}/>
    <path d="M6.8 15.5H17.2L16 20.2Q15.9 20.8 15.2 20.8H8.8Q8.1 20.8 8 20.2Z" fill="#FDBA74" {...S}/>
    {face(p, 12, 17.3, 1.7)}
  </>),
  pool: (p, S) => (<>
    <path d="M7.5 13V6.5Q7.5 4.5 9.3 4.5T11 6.5M11.5 13V6.5Q11.5 4.5 13.3 4.5" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <path d="M7.5 8H11.5M7.5 10.8H11.5" stroke={p.s} strokeWidth="1" strokeLinecap="round"/>
    <rect x="3" y="12" width="18" height="8" rx="2.6" fill={p.f} {...S}/>
    <path d="M5.5 14.2Q7 13 8.5 14.2T11.5 14.2" stroke={p.b} strokeWidth="1" strokeLinecap="round" fill="none"/>
    {face(p, 15.5, 15.6, 1.7)}
    <circle cx="18.5" cy="7.5" r="1" fill={p.b} stroke={p.s} strokeWidth="0.6"/>
    <circle cx="16.5" cy="5.5" r="0.7" fill={p.b} stroke={p.s} strokeWidth="0.5"/>
  </>),
  skimmer: (p, S) => (<>
    <path d="M21 2.8L11 12.8" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    <circle cx="7.5" cy="15.5" r="5" fill={p.b} {...S}/>
    <path d="M3.5 12.5Q7.5 14.3 11.5 12.5M3 15.5H12M3.8 18.5Q7.5 16.8 11.2 18.5M5.5 11V15M9.5 11V15" stroke={p.s} strokeWidth="0.5" opacity="0.3" fill="none"/>
    {face(p, 7.5, 15, 1.7)}
    <path d="M13.5 20.5Q15 19.3 16.5 20.5T19.5 20.5T22.5 20.5" stroke={p.f} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
    <path d="M13.5 20.5Q15 19.3 16.5 20.5T19.5 20.5" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
  </>),
  hose: (p, S) => (<>
    <circle cx="10.5" cy="11" r="7" fill={p.b} {...S}/>
    <circle cx="10.5" cy="11" r="4" fill={p.f} stroke={p.s} strokeWidth="1.1"/>
    {face(p, 10.5, 10.5, 1.4)}
    <path d="M13.5 16.5Q16 18.5 17 19.5" stroke={p.s} strokeWidth="2.6" strokeLinecap="round" fill="none"/>
    <path d="M13.5 16.5Q16 18.5 17 19.5" stroke={p.f} strokeWidth="1" strokeLinecap="round" fill="none"/>
    <rect x="17" y="18" width="4.2" height="3.2" rx="1" transform="rotate(20 19 19.6)" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <path d="M21.8 15.6L22.6 14M21.6 18.6L23 18.4" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
  </>),
  shovel: (p, S) => (<>
    <path d="M19 3L12.5 13.5" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    <path d="M17 2.5H21" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
    <path d="M7 12.5L15 10.5L18 17.5Q12 21 6.5 18.5Q5.5 15.5 7 12.5Z" fill={p.b} {...S}/>
    {face(p, 11.8, 15.2, 1.6)}
    <path d="M3 21H9" stroke={p.f} strokeWidth="2" strokeLinecap="round"/>
    <path d="M3 21H9" stroke={p.s} strokeWidth="0.6" strokeLinecap="round" opacity="0.5"/>
    {sparkle(p, 5, 7.5, 1.7)}
    {sparkle(p, 9.5, 4.5, 1.1)}
  </>),
  weeds: (p, S) => (<>
    <path d="M12 14V12M12 12C9 11.5 6.5 9.5 6 5C9.5 5.2 11.7 7.8 12 12ZM12 12C15 11.5 17.5 9.5 18 5C14.5 5.2 12.3 7.8 12 12Z" fill={p.f} {...S}/>
    <path d="M12 12C11.2 9 11.2 6.5 12 3.5C12.8 6.5 12.8 9 12 12Z" fill={p.f} {...S}/>
    <circle cx="12" cy="14.8" r="3.2" fill={p.b} {...S}/>
    {face(p, 12, 14.4, 1.2)}
    <path d="M10.5 17.8C9.5 19 8 19.5 6.5 19.2M12 18V21M13.5 17.8C14.5 19 16 19.5 17.5 19.2" stroke={p.s} strokeWidth="1.1" strokeLinecap="round" fill="none"/>
    <circle cx="5" cy="20.5" r="0.8" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
    <circle cx="19.5" cy="20" r="0.9" fill={p.f} stroke={p.s} strokeWidth="0.5"/>
  </>),

  // ===== CAR & GARAGE =====
  car: (p, S) => (<>
    {carBody(p, S)}
    <path d="M9 8.3H11.2V11H8ZM12.8 8.3H15V11H16Z" fill={p.b} stroke={p.s} strokeWidth="0.7" strokeLinejoin="round"/>
  </>),
  carwash: (p, S) => (<>
    <g transform="translate(3.2 8) scale(0.72)">{carBody(p, { ...S, strokeWidth: 1.8 })}</g>
    <circle cx="6" cy="5.2" r="2" fill={p.b} stroke={p.s} strokeWidth="0.9"/>
    <circle cx="11" cy="3.8" r="1.4" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
    <circle cx="16" cy="5.5" r="2.4" fill={p.b} stroke={p.s} strokeWidth="0.9"/>
    <circle cx="20" cy="3.6" r="1.1" fill={p.b} stroke={p.s} strokeWidth="0.7"/>
    <path d="M4 21.5Q6 20.5 8 21.5T12 21.5T16 21.5T20 21.5" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.5"/>
  </>),
  bike: (p, S) => (<>
    <circle cx="6" cy="16" r="4" fill={p.b} {...S}/>
    <circle cx="18" cy="16" r="4" fill={p.b} {...S}/>
    <path d="M6 16L9.8 8.5L16.2 8.5L18 16M9.8 8.5L11.8 16L16.2 8.5M6 16H11.8" stroke={p.s} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M8 7H11.5" stroke={p.s} strokeWidth="2" strokeLinecap="round"/>
    <path d="M16.2 8.5L15.5 5.5H18.5" stroke={p.s} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="6" cy="16" r="1" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
    <circle cx="18" cy="16" r="1" fill={p.f} stroke={p.s} strokeWidth="0.7"/>
    <circle cx="11.8" cy="16" r="1.3" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
  </>),

  // ===== HOME UPKEEP =====
  smokealarm: (p, S) => (<>
    <ellipse cx="12" cy="13" rx="9" ry="8" fill={p.b} {...S}/>
    <circle cx="12" cy="13" r="5.4" fill={p.f} stroke={p.s} strokeWidth="1"/>
    {face(p, 12, 12.3, 1.8)}
    <circle cx="12" cy="6.3" r="0.8" fill="#EF4444"/>
    <path d="M4.5 8.5L3.5 7.5M19.5 8.5L20.5 7.5M3.2 11H2M20.8 11H22" stroke={p.s} strokeWidth="0.9" strokeLinecap="round"/>
  </>),
  extinguisher: (p, S) => (<>
    <path d="M14 6.8C19 6.8 19 12 17.4 13.2" stroke={p.s} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
    <rect x="8" y="9" width="8" height="12" rx="3.2" fill={p.f} {...S}/>
    <rect x="9.3" y="12.5" width="5.4" height="6" rx="1.2" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
    {face(p, 12, 14.7, 1.3)}
    <rect x="10" y="5.5" width="4" height="3.5" rx="0.8" fill={p.b} {...S}/>
    <path d="M7.5 4.5H14.5" stroke={p.s} strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M7 4.5L6 6.5" stroke={p.s} strokeWidth="1.2" strokeLinecap="round"/>
  </>),
  airfilter: (p, S) => (<>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.8" fill={p.b} {...S}/>
    <rect x="6" y="6" width="12" height="12" rx="1.2" fill={p.f} stroke={p.s} strokeWidth="0.9"/>
    <path d="M8 6V18M10 6V18M12 6V18M14 6V18M16 6V18" stroke={p.s} strokeWidth="0.6" opacity="0.4"/>
    <circle cx="12" cy="12" r="3.6" fill={p.b} stroke={p.s} strokeWidth="0.9"/>
    {face(p, 12, 11.4, 1.3)}
  </>),
  waterfilter: (p, S) => (<>
    <path d="M16 9.5H18.3Q20 9.5 20 11.2V13.8Q20 15.5 18.3 15.5H15.7" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <path d="M5.5 7H16L15.4 19.8Q15.3 21 14.2 21H7.3Q6.2 21 6.1 19.8Z" fill={p.b} {...S}/>
    <path d="M5.9 13Q8 12 10.5 13T15.8 13L15.4 19.8Q15.3 21 14.2 21H7.3Q6.2 21 6.1 19.8Z" fill={p.f} stroke={p.s} strokeWidth="1" strokeLinejoin="round"/>
    <rect x="4.8" y="4.5" width="12" height="2.6" rx="1.1" fill={p.f} {...S}/>
    {face(p, 10.8, 16, 1.7)}
    <path d="M19 3.2C19 3.2 17.6 4.8 17.6 5.6C17.6 6.4 18.2 7 19 7C19.8 7 20.4 6.4 20.4 5.6C20.4 4.8 19 3.2 19 3.2Z" fill={p.f} stroke={p.s} strokeWidth="0.7" strokeLinejoin="round"/>
  </>),
  battery: (p, S) => (<>
    <rect x="2.5" y="7.5" width="17" height="10" rx="2.8" fill={p.b} {...S}/>
    <rect x="19.5" y="10.5" width="2.5" height="4" rx="1" fill={p.f} {...S}/>
    <rect x="4.5" y="9.5" width="5" height="6" rx="1.2" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
    {face(p, 14.2, 11.8, 1.5)}
    <path d="M7 3.2L5.6 5.8H7.3L6.5 8" stroke={p.s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </>),
  lightbulb: (p, S) => (<>
    <path d="M12 3C8 3 5.5 6 5.5 9.2C5.5 11.6 7 12.8 8.2 14.2C8.8 15 9 15.6 9 16.5H15C15 15.6 15.2 15 15.8 14.2C17 12.8 18.5 11.6 18.5 9.2C18.5 6 16 3 12 3Z" fill={p.f} {...S}/>
    <path d="M7.5 7.5Q8.3 5.5 10 4.8" stroke={p.b} strokeWidth="1" strokeLinecap="round" fill="none"/>
    <rect x="8.8" y="16.5" width="6.4" height="2.3" rx="1" fill={p.b} {...S}/>
    <rect x="10" y="18.8" width="4" height="2" rx="1" fill={p.b} {...S}/>
    {face(p, 12, 9.3, 2)}
    <path d="M3 4.5L4.4 5.6M21 4.5L19.6 5.6M2 9.5H3.5M22 9.5H20.5" stroke={p.s} strokeWidth="1" strokeLinecap="round"/>
  </>),
  recycling: (p, S) => (<>
    <path d="M12 4.8L19.5 17.5H4.5Z" fill={p.b} {...S} strokeWidth="1.6"/>
    <path d="M17.3 14.1L17.7 12.15L15.4 13.45Z M8.4 17L9.9 15.7V18.3Z M10.3 7.9L10.7 9.85L8.4 8.55Z" fill={p.s} stroke={p.s} strokeWidth="0.8" strokeLinejoin="round"/>
    {face(p, 12, 12.6, 1.5)}
  </>),
  mail: (p, S) => (<>
    <rect x="2.8" y="5.5" width="18.4" height="13.5" rx="2.6" fill={p.b} {...S}/>
    <path d="M3.5 7.2L12 13.2L20.5 7.2" stroke={p.s} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill={p.f}/>
    {face(p, 12, 15.6, 2.2)}
  </>),

  // ===== ERRANDS & MONEY =====
  groceries: (p, S) => (<>
    <ellipse cx="8.6" cy="6.5" rx="1.7" ry="4.2" transform="rotate(-18 8.6 6.5)" fill={p.f} {...S}/>
    <circle cx="14.5" cy="6" r="2" fill="#BBF7D0" stroke={p.s} strokeWidth="1"/>
    <circle cx="16.8" cy="7" r="1.6" fill="#BBF7D0" stroke={p.s} strokeWidth="1"/>
    <path d="M4.5 8.5H19.5L18.4 20Q18.3 21 17.3 21H6.7Q5.7 21 5.6 20Z" fill={p.b} {...S}/>
    <path d="M4.5 8.5H19.5" stroke={p.s} strokeWidth={W}/>
    <path d="M5 11H19" stroke={p.s} strokeWidth="0.6" opacity="0.4"/>
    {face(p, 12, 14.8, 2)}
  </>),
  cart: (p, S) => (<>
    <path d="M2.5 4.5H5L7.8 15.5H18.2" stroke={p.s} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M5.8 7.5H21L19 14.8Q18.8 15.5 18 15.5H8Z" fill={p.b} {...S}/>
    <path d="M9 7.5L9.6 15.5M13 7.5V15.5M17 7.5L16.5 15.5" stroke={p.s} strokeWidth="0.5" opacity="0.3"/>
    {face(p, 13, 10.6, 2)}
    <circle cx="9.5" cy="19" r="1.7" fill={p.f} {...S}/>
    <circle cx="17" cy="19" r="1.7" fill={p.f} {...S}/>
  </>),
  bills: (p, S) => (<>
    <rect x="5" y="4.5" width="16" height="10" rx="2" transform="rotate(-8 13 9.5)" fill={p.f} {...S}/>
    <rect x="3" y="8.5" width="18" height="11" rx="2.2" fill={p.b} {...S}/>
    <circle cx="12" cy="14" r="3.4" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <text x="12" y="16.3" textAnchor="middle" fontSize="6" fontWeight="800" fontFamily="system-ui, sans-serif" fill={p.s}>$</text>
    <circle cx="5.7" cy="11.2" r="0.7" fill={p.s}/>
    <circle cx="18.3" cy="16.8" r="0.7" fill={p.s}/>
  </>),
  piggybank: (p, S) => (<>
    <path d="M3.5 12.5Q1.5 12 2.2 10.2Q3.5 11 4.5 11.4" stroke={p.s} strokeWidth="1.1" strokeLinecap="round" fill="none"/>
    <path d="M7.5 8.6L8.6 5.6L11.4 7.4Z" fill={p.f} {...S}/>
    <ellipse cx="11.5" cy="13" rx="8" ry="6" fill={p.b} {...S}/>
    <ellipse cx="19.3" cy="13.3" rx="2.2" ry="2.5" fill={p.f} {...S}/>
    <circle cx="18.6" cy="13.3" r="0.5" fill={p.s}/>
    <circle cx="20.2" cy="13.3" r="0.5" fill={p.s}/>
    <path d="M8 18.5V20.8M15 18.5V20.8" stroke={p.s} strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="14.7" cy="11" r="0.65" fill={p.s}/>
    <circle cx="13.5" cy="13.5" r="1" fill={p.f} opacity="0.9"/>
    <path d="M9 7.6H13" stroke={p.s} strokeWidth="1.2" strokeLinecap="round"/>
    <circle cx="11" cy="3.8" r="2" fill={p.f} stroke={p.s} strokeWidth="1"/>
    <path d="M11 3V4.6" stroke={p.s} strokeWidth="0.7" strokeLinecap="round"/>
    <path d="M9 14.2Q10.5 15.4 12 14.2" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
  </>),
  calendar: (p, S) => (<>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.8" fill={p.b} {...S}/>
    <path d="M3.5 9V7.8Q3.5 5 6.3 5H17.7Q20.5 5 20.5 7.8V9Z" fill={p.f} stroke={p.s} strokeWidth={W} strokeLinejoin="round"/>
    <path d="M8 3V6.5M16 3V6.5" stroke={p.s} strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="8" cy="11.8" r="0.6" fill={p.s} opacity="0.5"/>
    <circle cx="12" cy="11.8" r="0.6" fill={p.s} opacity="0.5"/>
    <circle cx="16" cy="11.8" r="0.6" fill={p.s} opacity="0.5"/>
    {face(p, 12, 14.6, 2)}
  </>),

  // ===== COOKING =====
  cooking: (p, S) => (<>
    <path d="M4 10.5H20V16Q20 20 16 20H8Q4 20 4 16Z" fill={p.b} {...S}/>
    <path d="M4.3 10.5C4.3 6.8 19.7 6.8 19.7 10.5Z" fill={p.f} {...S}/>
    <circle cx="12" cy="6.4" r="1.2" fill={p.b} stroke={p.s} strokeWidth="1"/>
    <path d="M4 12.5H2.5M20 12.5H21.5" stroke={p.s} strokeWidth="1.8" strokeLinecap="round"/>
    {face(p, 12, 14.5, 2.2)}
    <path d="M8 4.5Q7 3.2 8 2M16 4.5Q17 3.2 16 2" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.5"/>
  </>),
  lunchbox: (p, S) => (<>
    <path d="M9 8V6.4Q9 5 10.4 5H13.6Q15 5 15 6.4V8" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <rect x="3" y="8" width="18" height="12" rx="3.2" fill={p.b} {...S}/>
    <path d="M3 12.5V11.2Q3 8 6.2 8H17.8Q21 8 21 11.2V12.5Z" fill={p.f} stroke={p.s} strokeWidth={W} strokeLinejoin="round"/>
    <rect x="10.3" y="11" width="3.4" height="3" rx="1" fill={p.b} stroke={p.s} strokeWidth="1"/>
    {face(p, 12, 16.7, 2.2)}
  </>),
  table: (p, S) => (<>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.2" fill={p.f}/>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.2" fill="none" {...S}/>
    <circle cx="12" cy="12" r="5.3" fill={p.b} {...S}/>
    <circle cx="12" cy="12" r="3.6" fill={p.f} stroke={p.s} strokeWidth="0.8"/>
    {face(p, 12, 11.5, 1.3)}
    <path d="M4.8 7V10.5Q4.8 11.5 5.6 11.5V17M6.6 7V10.5M3.8 7V10.5" stroke={p.s} strokeWidth="1" strokeLinecap="round" fill="none"/>
    <path d="M19 7Q21.2 9 19 13V17" stroke={p.s} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill={p.b}/>
  </>),

  // ===== LAUNDRY =====
  folding: (p, S) => (<>
    <rect x="4" y="14.8" width="16" height="5.5" rx="1.8" fill={p.b} {...S}/>
    <rect x="5" y="9" width="14" height="5.8" rx="1.8" fill={p.f} {...S}/>
    <rect x="6" y="3.8" width="12" height="5.2" rx="1.8" fill={p.b} {...S}/>
    <path d="M10.2 3.8L12 6.2L13.8 3.8" stroke={p.s} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"/>
    {face(p, 12, 11.4, 1.8)}
    <path d="M7 17.5H9" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" opacity="0.4"/>
  </>),
  hanger: (p, S) => (<>
    <path d="M12 9V8Q12 6.8 13.2 6.4Q14.8 5.8 14.8 4.4Q14.8 3 12.5 3Q10.2 3 10.2 4.8" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <path d="M12 8.5L21 16Q21.8 17.5 20.2 17.5H3.8Q2.2 17.5 3 16Z" fill={p.b} {...S}/>
    <path d="M12 8.5L21 16Q21.8 17.5 20.2 17.5H3.8Q2.2 17.5 3 16" fill="none" stroke={p.s} strokeWidth={W}/>
    {face(p, 12, 14, 1.8)}
    {sparkle(p, 19, 5, 1.8)}
  </>),

  // ===== SCHOOL & ROUTINES =====
  homework: (p, S) => (<>
    <rect x="3.5" y="3.5" width="13" height="17" rx="2" fill={p.b} {...S}/>
    <path d="M6.5 7.5H13.5M6.5 10H11" stroke={p.s} strokeWidth="0.9" strokeLinecap="round" opacity="0.6"/>
    {face(p, 9.2, 14.2, 1.6)}
    <g transform="rotate(40 17 14)">
      <rect x="15.6" y="6" width="2.8" height="11" rx="0.6" fill={p.f} {...S} strokeWidth="1.2"/>
      <path d="M15.6 17L17 20.5L18.4 17Z" fill={p.b} stroke={p.s} strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M15.6 8.4H18.4" stroke={p.s} strokeWidth="0.8"/>
    </g>
  </>),
  backpack: (p, S) => (<>
    <path d="M9.5 7V5.8Q9.5 4 11.2 4H12.8Q14.5 4 14.5 5.8V7" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <rect x="5" y="6.5" width="14" height="14.5" rx="5" fill={p.b} {...S}/>
    <rect x="7.5" y="14" width="9" height="5.5" rx="2" fill={p.f} stroke={p.s} strokeWidth="1.1"/>
    <path d="M9 15.8H15" stroke={p.s} strokeWidth="0.8" strokeLinecap="round"/>
    {face(p, 12, 10.5, 2)}
    <path d="M3.5 12V16M20.5 12V16" stroke={p.s} strokeWidth="1.6" strokeLinecap="round"/>
  </>),
  reportcard: (p, S) => (<>
    <rect x="4.5" y="2.8" width="15" height="18.4" rx="2.2" fill={p.b} {...S}/>
    <path d="M7.5 6.5H12" stroke={p.s} strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
    <text x="12" y="14.6" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="system-ui, sans-serif" fill={p.s}>A+</text>
    <path d="M7.5 17.8H16.5" stroke={p.s} strokeWidth="0.9" strokeLinecap="round" opacity="0.6"/>
    {sparkle(p, 17, 6.2, 1.7)}
  </>),
  bus: (p, S) => (<>
    <rect x="2" y="5.5" width="20" height="13" rx="3" fill={p.f} {...S}/>
    <rect x="4" y="8" width="3.8" height="3.8" rx="0.8" fill={p.b} stroke={p.s} strokeWidth="0.9"/>
    <rect x="9" y="8" width="3.8" height="3.8" rx="0.8" fill={p.b} stroke={p.s} strokeWidth="0.9"/>
    <rect x="14" y="8" width="3.8" height="3.8" rx="0.8" fill={p.b} stroke={p.s} strokeWidth="0.9"/>
    <path d="M2.3 13.4H21.7" stroke={p.s} strokeWidth="0.9"/>
    <path d="M19.2 8H20.6" stroke={p.s} strokeWidth="2" strokeLinecap="round"/>
    {face(p, 12, 14.6, 1.8)}
    <circle cx="7" cy="18.5" r="2.3" fill={p.b} {...S}/>
    <circle cx="17" cy="18.5" r="2.3" fill={p.b} {...S}/>
    <circle cx="21" cy="14.8" r="0.7" fill={p.b} stroke={p.s} strokeWidth="0.5"/>
  </>),
  alarmclock: (p, S) => (<>
    <path d="M5.5 4.2Q8 3 9.3 5M18.5 4.2Q16 3 14.7 5" stroke={p.s} strokeWidth="1.2" fill={p.f} strokeLinecap="round"/>
    <circle cx="5.7" cy="5.8" r="2.4" fill={p.f} {...S}/>
    <circle cx="18.3" cy="5.8" r="2.4" fill={p.f} {...S}/>
    <circle cx="12" cy="13.5" r="7.3" fill={p.b} {...S}/>
    <path d="M12 8.2V9.2M12 17.8V18.8M6.7 13.5H7.7M16.3 13.5H17.3" stroke={p.s} strokeWidth="0.9" strokeLinecap="round" opacity="0.6"/>
    <path d="M12 13.5V10.6M12 13.5L14.2 14.7" stroke={p.s} strokeWidth="1.2" strokeLinecap="round"/>
    <circle cx="12" cy="13.5" r="0.7" fill={p.s}/>
    <path d="M7.5 20L6.3 21.8M16.5 20L17.7 21.8" stroke={p.s} strokeWidth={W} strokeLinecap="round"/>
  </>),
  bedtime: (p, S) => (<>
    <path d="M20.5 13.5A8.8 8.8 0 1 1 10.5 3.5A7 7 0 0 0 20.5 13.5Z" fill={p.f} {...S}/>
    {face(p, 9.2, 13.3, 1.6)}
    {sparkle(p, 17.5, 5, 2)}
    {sparkle(p, 21, 9.5, 1.2)}
    {sparkle(p, 14.5, 9.5, 0.9)}
  </>),
  hairbrush: (p, S) => (<g transform="rotate(35 12 12)">
    <rect x="10.2" y="12.5" width="3.6" height="9" rx="1.8" fill={p.f} {...S}/>
    <rect x="7.5" y="1.8" width="9" height="11.5" rx="4.2" fill={p.b} {...S}/>
    <circle cx="10" cy="4.6" r="0.55" fill={p.s}/>
    <circle cx="12" cy="4.6" r="0.55" fill={p.s}/>
    <circle cx="14" cy="4.6" r="0.55" fill={p.s}/>
    <circle cx="10.6" cy="6.5" r="0.55" fill={p.s}/>
    <circle cx="13.4" cy="6.5" r="0.55" fill={p.s}/>
    {face(p, 12, 9.2, 1.4)}
  </g>),
  shoes: (p, S) => (<>
    <path d="M3.5 17V9.5Q3.5 8.5 4.5 8.5H8.3Q9.3 11.8 12.3 12.3L17 11.5Q20.5 12.2 20.5 16V17Z" fill={p.b} {...S}/>
    <rect x="2.5" y="16.5" width="19" height="3.5" rx="1.7" fill={p.f} {...S}/>
    <path d="M9.6 9.6L11.2 8.4M11.4 10.8L13 9.6M13.4 11.4L15 10.4" stroke={p.s} strokeWidth="1" strokeLinecap="round"/>
    <circle cx="15.2" cy="14.2" r="0.55" fill={p.s}/>
    <circle cx="18" cy="14.2" r="0.55" fill={p.s}/>
    <path d="M15.8 15.6Q16.6 16.4 17.4 15.6" stroke={p.s} strokeWidth="0.7" strokeLinecap="round" fill="none"/>
  </>),
  toys: (p, S) => (<>
    <rect x="4.5" y="4" width="6" height="6" rx="1.2" transform="rotate(-12 7.5 7)" fill={p.f} {...S}/>
    <text x="7.5" y="9.3" textAnchor="middle" fontSize="4.2" fontWeight="800" fontFamily="system-ui, sans-serif" fill={p.s} transform="rotate(-12 7.5 7)">A</text>
    <circle cx="16" cy="7.5" r="3.5" fill={p.f} {...S}/>
    <path d="M13.2 6Q16 8.4 18.8 6" stroke={p.b} strokeWidth="1" fill="none" strokeLinecap="round"/>
    <rect x="3" y="11" width="18" height="9.5" rx="2.4" fill={p.b} {...S}/>
    <path d="M3 14H21" stroke={p.s} strokeWidth="1" opacity="0.5"/>
    {face(p, 12, 16.7, 2.2)}
  </>),
  reading: (p, S) => (<>
    <path d="M12 7Q8 4.2 2.8 5V18Q8 17.2 12 19.8Z" fill={p.b} {...S}/>
    <path d="M12 7Q16 4.2 21.2 5V18Q16 17.2 12 19.8Z" fill={p.f} {...S}/>
    <path d="M5 8.2Q7.5 7.8 9.6 9M14.4 9Q16.5 7.8 19 8.2" stroke={p.s} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.5"/>
    {face(p, 12, 12.2, 3)}
    <path d="M12 7V19.8" stroke={p.s} strokeWidth="1"/>
    {sparkle(p, 19.5, 2.8, 1.5)}
  </>),

  // ===== WORK =====
  briefcase: (p, S) => (<>
    <path d="M9 8V6.4Q9 5 10.4 5H13.6Q15 5 15 6.4V8" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <rect x="3" y="8" width="18" height="12" rx="2.6" fill={p.b} {...S}/>
    <path d="M3 13.2H21" stroke={p.s} strokeWidth="1.2"/>
    <rect x="10.4" y="11.7" width="3.2" height="3" rx="0.9" fill={p.f} stroke={p.s} strokeWidth="1"/>
    {face(p, 12, 17, 2.2)}
  </>),
  phone: (p, S) => (<>
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" fill={p.b} {...S}/>
    <rect x="8.3" y="5.5" width="7.4" height="11" rx="1.2" fill={p.f} stroke={p.s} strokeWidth="0.9"/>
    {face(p, 12, 8.8, 1.7)}
    <path d="M10.2 13.2L11.6 14.6L14 11.9" stroke={p.s} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="12" cy="19.1" r="0.7" fill={p.s}/>
  </>),

  // ===== WINS =====
  trophy: (p, S) => (<>
    <path d="M7 6.5H4.6Q4.4 11.5 8.2 12" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <path d="M17 6.5H19.4Q19.6 11.5 15.8 12" stroke={p.s} strokeWidth={W} strokeLinecap="round" fill="none"/>
    <path d="M7 3.8H17V9.5Q17 14.5 12 14.5Q7 14.5 7 9.5Z" fill={p.f} {...S}/>
    <rect x="10.8" y="14.5" width="2.4" height="3.4" fill={p.f} {...S} strokeWidth="1.2"/>
    <rect x="7.5" y="17.6" width="9" height="3.4" rx="1.2" fill={p.b} {...S}/>
    {face(p, 12, 8.8, 1.9)}
    <path d="M9 5.3V7" stroke={p.b} strokeWidth="1" strokeLinecap="round"/>
  </>),
  star: (p, S) => (<>
    <path d={starPath(12, 12.8, 9.6, 4.6)} fill={p.f} {...S} strokeWidth="1.6"/>
    {face(p, 12, 12.8, 1.8)}
    {sparkle(p, 20, 4, 1.4)}
  </>),
  streak: (p, S) => (<>
    <path d="M12 2.5C12 6 17.5 8.5 17.5 14.2C17.5 18 15 21.2 12 21.2C9 21.2 6.5 18 6.5 14.2C6.5 11.6 8 10 8.6 8.4C10 9.4 10.6 10.4 10.6 10.4C11.6 8 12 5.5 12 2.5Z" fill={p.f} {...S}/>
    <path d="M12 12C12 14 15.2 15 15.2 17.6C15.2 19.3 13.8 20.5 12 20.5C10.2 20.5 8.8 19.3 8.8 17.6C8.8 15 12 14 12 12Z" fill={p.b} stroke={p.s} strokeWidth="0.9" strokeLinejoin="round"/>
    {face(p, 12, 16.6, 1.2)}
  </>),
  medal: (p, S) => (<>
    <path d="M7.2 2.8H11L14.2 10.4H10.2Z" fill={p.b} {...S}/>
    <path d="M16.8 2.8H13L9.8 10.4H13.8Z" fill={p.f} {...S}/>
    <circle cx="12" cy="15.5" r="6" fill={p.f} {...S}/>
    <circle cx="12" cy="15.5" r="4.2" fill={p.b} stroke={p.s} strokeWidth="0.8"/>
    {face(p, 12, 14.8, 1.5)}
  </>),
  heart: (p, S) => (<>
    <path d="M12 20.5C12 20.5 3.5 15.2 3.5 9C3.5 6.2 5.7 4.5 8 4.5C9.7 4.5 11.2 5.4 12 6.8C12.8 5.4 14.3 4.5 16 4.5C18.3 4.5 20.5 6.2 20.5 9C20.5 15.2 12 20.5 12 20.5Z" fill={p.f} {...S}/>
    {face(p, 12, 11.4, 2.2)}
    <circle cx="7.8" cy="12.6" r="1.1" fill={p.b} opacity="0.8"/>
    <circle cx="16.2" cy="12.6" r="1.1" fill={p.b} opacity="0.8"/>
    {sparkle(p, 19.5, 3.5, 1.4)}
  </>),
};

/** Draws one extra icon; returns null for a key it doesn't know */
export function ExtraIcon({ k, size }: { k: string; size: number }): JSX.Element | null {
  if (!Object.prototype.hasOwnProperty.call(DRAW, k)) return null;
  const key = k as ExtraIconKey;
  const p = EXTRA_ICON_PALETTES[key];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {DRAW[key](p, mk(p, W), mk(p, 1))}
    </svg>
  );
}
