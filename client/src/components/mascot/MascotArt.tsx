/* eslint-disable react-refresh/only-export-components -- art kit exports data tables next to components by design */
import type { JSX, ReactNode } from 'react';

export type CreatureId = 'dog' | 'cat' | 'dragon' | 'robot' | 'fox' | 'bunny' | 'panda' | 'axolotl';
export type MascotMood = 'happy' | 'fine' | 'messy' | 'sad' | 'sleep';

export const CREATURE_IDS: CreatureId[] = ['dog', 'cat', 'dragon', 'robot', 'fox', 'bunny', 'panda', 'axolotl'];

/** Points in the 120x120 box where overlays attach */
export interface Anchors {
  headTop: { x: number; y: number };
  headWidth: number;
  neck: { x: number; y: number };
  /** point between the two eyes (glasses, masks) */
  eyes: { x: number; y: number };
}

const INK = '#4A3728';
const OUT = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const SOFT = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

/* ---------- shared pieces ---------- */

interface FaceProps {
  mood: MascotMood;
  ey: number;
  dx: number;
  my: number;
  cx?: number;
  ink?: string;
  eye?: string;
  hi?: string;
  brow?: string;
  sclera?: boolean;
  cheek?: string;
  mouthHalf?: number;
}

function Face({
  mood, ey, dx, my, cx = 60, ink = INK, eye = INK, hi = '#FFFFFF', brow = INK,
  sclera = false, cheek = '#FF9FB2', mouthHalf = 9,
}: FaceProps): JSX.Element {
  const lx = cx - dx;
  const rx = cx + dx;
  const h = mouthHalf;
  const eyeAt = (x: number, r: number, key: string) => (
    <g key={key}>
      {sclera && <circle cx={x} cy={ey} r={r + 2.2} fill="#FFFFFF" />}
      <circle cx={x} cy={ey} r={r} fill={eye} />
      <circle cx={x + r * 0.4} cy={ey - r * 0.4} r={r * 0.4} fill={hi} />
      {(mood === 'happy' || mood === 'sad') && (
        <circle cx={x - r * 0.4} cy={ey + r * 0.45} r={r * 0.2} fill={hi} />
      )}
    </g>
  );
  const line = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={brow} strokeWidth={2} strokeLinecap="round" />
  );
  const showCheeks = mood !== 'sad';
  const cheekOp = mood === 'fine' ? 0.45 : mood === 'sleep' ? 0.75 : 0.6;
  return (
    <g>
      {showCheeks && (
        <g opacity={cheekOp}>
          <ellipse cx={lx - 7} cy={ey + 11} rx={5.5} ry={4} fill={cheek} />
          <ellipse cx={rx + 7} cy={ey + 11} rx={5.5} ry={4} fill={cheek} />
        </g>
      )}
      {mood === 'happy' && (
        <>
          {eyeAt(lx, 5, 'l')}
          {eyeAt(rx, 5, 'r')}
          <path d={`M${cx - h - 1} ${my} Q${cx} ${my + 17} ${cx + h + 1} ${my} Z`} fill={ink} stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />
          <ellipse cx={cx} cy={my + 5.6} rx={4.6} ry={2.3} fill="#FF8FA3" />
          <path d={`M${rx + 8} ${ey - 9} l0 5 M${rx + 5.5} ${ey - 6.5} l5 0`} stroke={hi === '#FFFFFF' ? '#FFD54A' : hi} strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      )}
      {mood === 'fine' && (
        <>
          {eyeAt(lx, 4.2, 'l')}
          {eyeAt(rx, 4.2, 'r')}
          <path d={`M${cx - 7} ${my} Q${cx} ${my + 7} ${cx + 7} ${my}`} stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'messy' && (
        <>
          {line(lx - 5, ey - 10, lx + 5, ey - 14, 'bl')}
          {line(rx - 5, ey - 8, rx + 5, ey - 8, 'br')}
          {eyeAt(lx, 4.4, 'l')}
          {eyeAt(rx, 3.4, 'r')}
          <path d={`M${cx - 8} ${my + 1} q3 -4 5.3 0 t5.3 0 t5.3 0`} stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M${rx + 9} ${ey - 5} q4 5 0 8 q-4 -3 0 -8 Z`} fill="#8FD3FF" stroke="#5FA8D8" strokeWidth={1} strokeLinejoin="round" />
        </>
      )}
      {mood === 'sleep' && (
        <>
          <path d={`M${lx - 5.5} ${ey - 1} Q${lx} ${ey + 4.5} ${lx + 5.5} ${ey - 1}`} stroke={brow} strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d={`M${rx - 5.5} ${ey - 1} Q${rx} ${ey + 4.5} ${rx + 5.5} ${ey - 1}`} stroke={brow} strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d={`M${cx - 5} ${my} Q${cx} ${my + 5} ${cx + 5} ${my}`} stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'sad' && (
        <>
          {line(lx - 5, ey - 7, lx + 4, ey - 12, 'bl')}
          {line(rx + 5, ey - 7, rx - 4, ey - 12, 'br')}
          {eyeAt(lx, 4.6, 'l')}
          {eyeAt(rx, 4.6, 'r')}
          <path d={`M${cx - 5} ${my + 3} Q${cx} ${my - 2} ${cx + 5} ${my + 3}`} stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d={`M${lx - 2} ${ey + 6} Q${lx + 2} ${ey + 11} ${lx - 2} ${ey + 14} Q${lx - 6} ${ey + 11} ${lx - 2} ${ey + 6} Z`} fill="#8FD3FF" stroke="#5FA8D8" strokeWidth={1} strokeLinejoin="round" />
        </>
      )}
    </g>
  );
}

function Torso({ fill, belly }: { fill: string; belly?: string }): JSX.Element {
  return (
    <g>
      <ellipse cx={60} cy={90} rx={25} ry={20} fill={fill} {...OUT} />
      {belly && <ellipse cx={60} cy={94} rx={15} ry={12} fill={belly} />}
    </g>
  );
}

function Limbs({ fill }: { fill: string }): JSX.Element {
  return (
    <g>
      <ellipse cx={35} cy={93} rx={6.5} ry={11} transform="rotate(14 35 93)" fill={fill} {...OUT} />
      <ellipse cx={85} cy={93} rx={6.5} ry={11} transform="rotate(-14 85 93)" fill={fill} {...OUT} />
    </g>
  );
}

function Feet({ fill }: { fill: string }): JSX.Element {
  return (
    <g>
      <ellipse cx={46} cy={107} rx={10} ry={5} fill={fill} {...OUT} />
      <ellipse cx={74} cy={107} rx={10} ry={5} fill={fill} {...OUT} />
    </g>
  );
}

/** Thick outlined curved tail (two strokes: outline under colour). */
function Tail({ d, fill, w = 8 }: { d: string; fill: string; w?: number }): JSX.Element {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={INK} strokeWidth={w + 4} />
      <path d={d} stroke={fill} strokeWidth={w} />
    </g>
  );
}

const HEAD = { cx: 60, cy: 56, r: 31 } as const;

/* ---------- creatures ---------- */

function Dog({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#E0B07A';
  const ear = '#A9744F';
  return (
    <g>
      <Tail d="M82 100 Q104 100 100 78" fill={c} w={7} />
      <ellipse cx={31} cy={54} rx={11} ry={22} transform="rotate(14 31 54)" fill={ear} {...OUT} />
      <ellipse cx={89} cy={54} rx={11} ry={22} transform="rotate(-14 89 54)" fill={ear} {...OUT} />
      <Torso fill={c} belly="#FFE9D2" />
      <Limbs fill={c} />
      <Feet fill={c} />
      <circle {...HEAD} fill={c} {...OUT} />
      <ellipse cx={45} cy={49} rx={9} ry={10} transform="rotate(-10 45 49)" fill={ear} opacity={0.55} />
      <ellipse cx={60} cy={69} rx={16} ry={12} fill="#FFE9D2" />
      <ellipse cx={60} cy={62} rx={5.5} ry={4} fill={INK} />
      <ellipse cx={58.5} cy={60.8} rx={1.8} ry={1} fill="#FFFFFF" opacity={0.8} />
      <Face mood={mood} ey={52} dx={16} my={70} />
    </g>
  );
}

function Cat({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#FFC48C';
  const stripe = '#EE9C5E';
  return (
    <g>
      <Tail d="M82 102 Q110 104 104 76" fill={c} w={8} />
      <path d="M29 44 L31 14 L54 29 Z" fill={c} {...OUT} />
      <path d="M91 44 L89 14 L66 29 Z" fill={c} {...OUT} />
      <path d="M34 38 L35 21 L47 30 Z" fill="#FFB5C5" />
      <path d="M86 38 L85 21 L73 30 Z" fill="#FFB5C5" />
      <Torso fill={c} belly="#FFF1E0" />
      <Limbs fill={c} />
      <Feet fill={c} />
      <circle {...HEAD} fill={c} {...OUT} />
      <path d="M60 26 L60 35 M52 27 L54 34 M68 27 L66 34" stroke={stripe} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M29 56 L36 57 M29 64 L36 62 M91 56 L84 57 M91 64 L84 62" stroke={stripe} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M56.5 60.5 L63.5 60.5 L60 65 Z" fill="#FF8FA8" stroke="#FF8FA8" strokeWidth={1.5} strokeLinejoin="round" />
      <Face mood={mood} ey={52} dx={16} my={68} mouthHalf={8} />
      <g {...SOFT} fill="none" opacity={0.7}>
        <path d="M18 58 L38 62 M18 67 L38 66 M102 58 L82 62 M102 67 L82 66" />
      </g>
    </g>
  );
}

function Dragon({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#8ED9A6';
  const dark = '#5FBF86';
  const belly = '#FFEFB5';
  return (
    <g>
      <Tail d="M82 102 Q108 104 102 82 Q100 76 108 74" fill={c} w={8} />
      <path d="M38 80 Q12 74 14 46 Q30 52 44 68 Z" fill={dark} {...OUT} />
      <path d="M82 80 Q108 74 106 46 Q90 52 76 68 Z" fill={dark} {...OUT} />
      <Torso fill={c} belly={belly} />
      <g fill="none" stroke="#E2C77A" strokeWidth={1.4} strokeLinecap="round">
        <path d="M52 88 q3 3 6 0 M62 88 q3 3 6 0 M47 96 q3 3 6 0 M57 96 q3 3 6 0 M67 96 q3 3 6 0 M52 103 q3 3 6 0 M62 103 q3 3 6 0" />
      </g>
      <Limbs fill={c} />
      <Feet fill={c} />
      <path d="M41 36 L38 17 L54 29 Z" fill="#FFD36E" {...OUT} />
      <path d="M79 36 L82 17 L66 29 Z" fill="#FFD36E" {...OUT} />
      <circle {...HEAD} fill={c} {...OUT} />
      <ellipse cx={60} cy={68} rx={15} ry={11} fill="#BFF0CB" />
      <circle cx={55} cy={63} r={1.6} fill={INK} />
      <circle cx={65} cy={63} r={1.6} fill={INK} />
      <Face mood={mood} ey={51} dx={16} my={70} />
    </g>
  );
}

function Robot({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#BFD0EA';
  return (
    <g>
      <rect x={42} y={80} width={36} height={30} rx={10} fill="#A9BEDD" {...OUT} />
      <circle cx={60} cy={95} r={6} fill="#FFD36E" {...OUT} strokeWidth={1.5} />
      <rect x={30} y={85} width={9} height={20} rx={4.5} fill={c} {...OUT} />
      <rect x={81} y={85} width={9} height={20} rx={4.5} fill={c} {...OUT} />
      <rect x={43} y={104} width={14} height={8} rx={4} fill={c} {...OUT} />
      <rect x={63} y={104} width={14} height={8} rx={4} fill={c} {...OUT} />
      <path d="M73 27 L78 19" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={78} cy={17} r={3.6} fill="#FF8FA3" {...OUT} />
      <circle cx={26} cy={53} r={5} fill="#98A9C8" {...OUT} />
      <circle cx={94} cy={53} r={5} fill="#98A9C8" {...OUT} />
      <rect x={28} y={26} width={64} height={56} rx={15} fill={c} {...OUT} />
      <rect x={35} y={33} width={50} height={42} rx={10} fill="#26334F" {...OUT} strokeWidth={1.6} />
      <Face mood={mood} ey={51} dx={13} my={62} ink="#8FF3FF" eye="#7DE3F4" hi="#FFFFFF" brow="#8FF3FF" cheek="#FF8FB1" mouthHalf={7} />
    </g>
  );
}

function Fox({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#F6A55C';
  return (
    <g>
      <clipPath id="mascot-fox-tail">
        <ellipse cx={96} cy={86} rx={11} ry={23} transform="rotate(32 96 86)" />
      </clipPath>
      <ellipse cx={96} cy={86} rx={11} ry={23} transform="rotate(32 96 86)" fill={c} />
      <g clipPath="url(#mascot-fox-tail)">
        <circle cx={108} cy={68} r={12} fill="#FFFFFF" />
      </g>
      <ellipse cx={96} cy={86} rx={11} ry={23} transform="rotate(32 96 86)" fill="none" {...OUT} />
      <Torso fill={c} belly="#FFFFFF" />
      <Limbs fill="#C77A3D" />
      <Feet fill="#C77A3D" />
      <path d="M29 46 L32 14 L55 30 Z" fill={c} {...OUT} />
      <path d="M91 46 L88 14 L65 30 Z" fill={c} {...OUT} />
      <path d="M35 38 L36 22 L48 31 Z" fill="#7A4A2A" />
      <path d="M85 38 L84 22 L72 31 Z" fill="#7A4A2A" />
      <circle {...HEAD} fill={c} {...OUT} />
      <path d="M31 60 Q45 58 60 67 Q75 58 89 60 Q82 86 60 86 Q38 86 31 60 Z" fill="#FFFFFF" />
      <ellipse cx={60} cy={65} rx={4.6} ry={3.4} fill={INK} />
      <Face mood={mood} ey={51} dx={16} my={70} />
    </g>
  );
}

function Bunny({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#F7F1EC';
  return (
    <g>
      <circle cx={88} cy={102} r={7} fill="#FFFFFF" {...OUT} />
      <g transform="rotate(-20 36 36)">
        <ellipse cx={34} cy={34} rx={8.5} ry={21} fill={c} {...OUT} />
        <ellipse cx={34} cy={36} rx={4.2} ry={14} fill="#FFB5C5" />
      </g>
      <g transform="rotate(20 84 36)">
        <ellipse cx={86} cy={34} rx={8.5} ry={21} fill={c} {...OUT} />
        <ellipse cx={86} cy={36} rx={4.2} ry={14} fill="#FFB5C5" />
      </g>
      <Torso fill={c} belly="#FFE3EA" />
      <Limbs fill={c} />
      <Feet fill={c} />
      <circle cx={60} cy={60} r={30} fill={c} {...OUT} />
      <ellipse cx={60} cy={63} rx={3.6} ry={2.8} fill="#FF9FB5" />
      <Face mood={mood} ey={55} dx={15} my={69} mouthHalf={8} />
      <g fill="#FFFFFF" stroke={INK} strokeWidth={1.2}>
        <rect x={56.5} y={72} width={3.2} height={4.6} rx={1} />
        <rect x={60.3} y={72} width={3.2} height={4.6} rx={1} />
      </g>
    </g>
  );
}

function Panda({ mood }: { mood: MascotMood }): JSX.Element {
  const w = '#FAFAFA';
  const k = '#4A4054';
  return (
    <g>
      <Torso fill={w} />
      <Limbs fill={k} />
      <Feet fill={k} />
      <circle cx={36} cy={31} r={10.5} fill={k} {...OUT} />
      <circle cx={84} cy={31} r={10.5} fill={k} {...OUT} />
      <circle {...HEAD} fill={w} {...OUT} />
      <ellipse cx={43} cy={56} rx={9} ry={11} transform="rotate(-24 43 56)" fill={k} />
      <ellipse cx={77} cy={56} rx={9} ry={11} transform="rotate(24 77 56)" fill={k} />
      <ellipse cx={60} cy={65} rx={5.4} ry={3.8} fill={INK} />
      <Face mood={mood} ey={55} dx={16} my={71} sclera brow="#FFFFFF" mouthHalf={8} />
    </g>
  );
}

function Axolotl({ mood }: { mood: MascotMood }): JSX.Element {
  const c = '#FFB6C9';
  const gill = '#FF7FA6';
  const gills = [-36, 0, 36];
  return (
    <g>
      <Tail d="M82 102 Q108 106 104 82" fill={c} w={9} />
      {([-1, 1] as const).map((s) => (
        <g key={s}>
          {gills.map((a) => (
            <g key={a} transform={`translate(${60 + s * 28} 54) scale(${s} 1) rotate(${a})`}>
              <ellipse cx={9} cy={0} rx={10} ry={4.6} fill={gill} {...OUT} />
            </g>
          ))}
        </g>
      ))}
      <Torso fill={c} belly="#FFE3EA" />
      <Limbs fill={c} />
      <Feet fill={c} />
      <ellipse cx={60} cy={58} rx={33} ry={29} fill={c} {...OUT} />
      <Face mood={mood} ey={55} dx={19} my={67} mouthHalf={9} cheek="#FF7FA6" />
    </g>
  );
}

export const CREATURES: Record<
  CreatureId,
  { label: string; color: string; anchors: Anchors; Art: (p: { mood: MascotMood }) => JSX.Element }
> = {
  dog: { label: 'Dog', color: '#E0B07A', anchors: { headTop: { x: 60, y: 25 }, headWidth: 62, neck: { x: 60, y: 85 }, eyes: { x: 60, y: 52 } }, Art: Dog },
  cat: { label: 'Cat', color: '#FFC48C', anchors: { headTop: { x: 60, y: 25 }, headWidth: 62, neck: { x: 60, y: 85 }, eyes: { x: 60, y: 52 } }, Art: Cat },
  dragon: { label: 'Dragon', color: '#8ED9A6', anchors: { headTop: { x: 60, y: 25 }, headWidth: 62, neck: { x: 60, y: 85 }, eyes: { x: 60, y: 51 } }, Art: Dragon },
  robot: { label: 'Robot', color: '#BFD0EA', anchors: { headTop: { x: 60, y: 26 }, headWidth: 64, neck: { x: 60, y: 82 }, eyes: { x: 60, y: 51 } }, Art: Robot },
  fox: { label: 'Fox', color: '#F6A55C', anchors: { headTop: { x: 60, y: 25 }, headWidth: 62, neck: { x: 60, y: 85 }, eyes: { x: 60, y: 51 } }, Art: Fox },
  bunny: { label: 'Bunny', color: '#F7F1EC', anchors: { headTop: { x: 60, y: 30 }, headWidth: 60, neck: { x: 60, y: 88 }, eyes: { x: 60, y: 55 } }, Art: Bunny },
  panda: { label: 'Panda', color: '#FAFAFA', anchors: { headTop: { x: 60, y: 25 }, headWidth: 62, neck: { x: 60, y: 85 }, eyes: { x: 60, y: 55 } }, Art: Panda },
  axolotl: { label: 'Axolotl', color: '#FFB6C9', anchors: { headTop: { x: 60, y: 29 }, headWidth: 66, neck: { x: 60, y: 86 }, eyes: { x: 60, y: 55 } }, Art: Axolotl },
};

/* ---------- overlays (drawn in a local frame: head top at 0,0, head width 64) ---------- */

export type OverlayId =
  | 'hat' | 'crown' | 'partyHat' | 'witchHat' | 'pilgrimHat' | 'santaHat' | 'scarf' | 'messyHair'
  | AccessoryId;

export type AccessoryId =
  | 'beanie' | 'bow' | 'flowerCrown' | 'wizardHat' | 'pirateHat' | 'cowboyHat' | 'headphones'
  | 'sunglasses' | 'glasses' | 'heroMask'
  | 'bowTie' | 'bandana' | 'necklace'
  | 'cape' | 'wings' | 'balloon';

/** Which slot each accessory occupies (back items are drawn BEFORE the creature) */
export const ACCESSORY_SLOTS: Record<AccessoryId, 'head' | 'face' | 'neck' | 'back'> = {
  beanie: 'head', bow: 'head', flowerCrown: 'head', wizardHat: 'head', pirateHat: 'head', cowboyHat: 'head', headphones: 'head',
  sunglasses: 'face', glasses: 'face', heroMask: 'face',
  bowTie: 'neck', bandana: 'neck', necklace: 'neck',
  cape: 'back', wings: 'back', balloon: 'back',
};

function Place({ a, at = 'head', children }: { a: Anchors; at?: 'head' | 'neck' | 'eyes'; children: ReactNode }): JSX.Element {
  const p = at === 'head' ? a.headTop : at === 'eyes' ? a.eyes : a.neck;
  return <g transform={`translate(${p.x} ${p.y}) scale(${a.headWidth / 64})`}>{children}</g>;
}

const HAT_THIN = { stroke: INK, strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

export const OVERLAYS: Record<OverlayId, (p: { a: Anchors }) => JSX.Element> = {
  hat: ({ a }) => (
    <Place a={a}>
      <ellipse cx={0} cy={3} rx={25} ry={5.5} fill="#5A5878" {...HAT_THIN} />
      <path d="M-15 3 L-15 -24 Q-15 -28 -11 -28 L11 -28 Q15 -28 15 -24 L15 3 Q0 8 -15 3 Z" fill="#5A5878" {...HAT_THIN} />
      <path d="M-15 -8 L15 -8 L15 -1 Q0 4 -15 -1 Z" fill="#E86A7A" {...HAT_THIN} strokeWidth={1.4} />
      <path d="M-10 -24 L-10 -12" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
    </Place>
  ),
  crown: ({ a }) => (
    <Place a={a}>
      <path d="M-19 3 L-22 -17 L-10 -7 L0 -22 L10 -7 L22 -17 L19 3 Q0 8 -19 3 Z" fill="#FFD54A" {...HAT_THIN} />
      <circle cx={-22} cy={-18} r={2.6} fill="#FF8FA3" {...HAT_THIN} strokeWidth={1.2} />
      <circle cx={0} cy={-23} r={2.8} fill="#FF8FA3" {...HAT_THIN} strokeWidth={1.2} />
      <circle cx={22} cy={-18} r={2.6} fill="#FF8FA3" {...HAT_THIN} strokeWidth={1.2} />
      <circle cx={0} cy={-2} r={3} fill="#6FC8F0" {...HAT_THIN} strokeWidth={1.2} />
      <circle cx={-11} cy={-1} r={2} fill="#7FD99A" {...HAT_THIN} strokeWidth={1.1} />
      <circle cx={11} cy={-1} r={2} fill="#7FD99A" {...HAT_THIN} strokeWidth={1.1} />
    </Place>
  ),
  partyHat: ({ a }) => {
    const bands: [number, number, string][] = [
      [-46, -34, '#FFE066'], [-34, -22, '#FF8FB1'], [-22, -10, '#FFE066'], [-10, 3, '#FF8FB1'],
    ];
    const hw = (y: number) => (17 * (y + 46)) / 49;
    return (
      <Place a={a}>
        <g transform="rotate(-8 0 3)">
          {bands.map(([y0, y1, f]) => (
            <path key={y0} d={`M${-hw(y0)} ${y0} L${hw(y0)} ${y0} L${hw(y1)} ${y1} L${-hw(y1)} ${y1} Z`} fill={f} />
          ))}
          <path d="M0 -46 L17 3 Q0 7 -17 3 Z" fill="none" {...HAT_THIN} />
          <circle cx={0} cy={-46} r={4.5} fill="#7FD3F5" {...HAT_THIN} />
        </g>
      </Place>
    );
  },
  witchHat: ({ a }) => (
    <Place a={a}>
      <ellipse cx={0} cy={3} rx={30} ry={6} fill="#54337F" {...HAT_THIN} />
      <path d="M-17 3 Q-10 -20 -3 -36 Q3 -48 21 -46 Q10 -38 12 -28 Q14 -12 17 3 Q0 8 -17 3 Z" fill="#6B46A0" {...HAT_THIN} />
      <path d="M-15 -6 Q-14 -10 -13 -12 L13.5 -12 Q14 -9 15 -5 Q0 -1 -15 -6 Z" fill="#2A2233" {...HAT_THIN} strokeWidth={1.4} />
      <rect x={-4} y={-11.5} width={8} height={7} rx={1.5} fill="#FFD54A" {...HAT_THIN} strokeWidth={1.3} />
    </Place>
  ),
  pilgrimHat: ({ a }) => (
    <Place a={a}>
      <ellipse cx={0} cy={3} rx={27} ry={5.5} fill="#3D3846" {...HAT_THIN} />
      <path d="M-15 3 L-12 -30 Q-12 -32 -10 -32 L10 -32 Q12 -32 12 -30 L15 3 Q0 8 -15 3 Z" fill="#3D3846" {...HAT_THIN} />
      <path d="M-14.5 -6 L14.5 -6 L15 2.5 Q0 7 -15 2.5 Z" fill="#1F1B24" {...HAT_THIN} strokeWidth={1.4} />
      <rect x={-5} y={-8} width={10} height={9} rx={2} fill="#FFD54A" {...HAT_THIN} strokeWidth={1.4} />
      <rect x={-2.2} y={-5.6} width={4.4} height={4.4} rx={0.8} fill="#3D3846" />
      <path d="M-8 -28 L-9 -14" stroke="#8B849A" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
    </Place>
  ),
  santaHat: ({ a }) => (
    <Place a={a}>
      <path d="M-25 3 C-25 -22 -8 -36 10 -34 C20 -33 29 -28 31 -17 C21 -24 17 -14 25 3 Z" fill="#E5484D" {...HAT_THIN} />
      <circle cx={31} cy={-15} r={6.5} fill="#FFFFFF" {...HAT_THIN} />
      <rect x={-28} y={-5} width={56} height={11} rx={5.5} fill="#FFFFFF" {...HAT_THIN} />
    </Place>
  ),
  scarf: ({ a }) => (
    <Place a={a} at="neck">
      <g transform="rotate(-6 14 4)">
        <rect x={9} y={2} width={12} height={26} rx={4} fill="#E5484D" />
        <rect x={9} y={10} width={12} height={4} fill="#FFFFFF" />
        <rect x={9} y={19} width={12} height={4} fill="#FFFFFF" />
        <rect x={9} y={2} width={12} height={26} rx={4} fill="none" {...HAT_THIN} />
      </g>
      <rect x={-27} y={-6} width={54} height={14} rx={7} fill="#E5484D" />
      <rect x={-17} y={-6} width={5} height={14} fill="#FFFFFF" />
      <rect x={-5} y={-6} width={5} height={14} fill="#FFFFFF" />
      <rect x={7} y={-6} width={5} height={14} fill="#FFFFFF" />
      <rect x={19} y={-6} width={5} height={14} fill="#FFFFFF" />
      <rect x={-27} y={-6} width={54} height={14} rx={7} fill="none" {...HAT_THIN} />
    </Place>
  ),
  messyHair: ({ a }) => (
    <Place a={a}>
      <g fill="#8B6B55" {...HAT_THIN}>
        <path d="M-17 6 Q-24 -8 -26 -14 Q-12 -10 -8 5 Z" />
        <path d="M-8 4 Q-12 -14 -9 -22 Q0 -14 1 4 Z" />
        <path d="M0 4 Q4 -14 12 -20 Q13 -8 9 5 Z" />
        <path d="M9 5 Q16 -4 26 -8 Q22 2 17 7 Z" />
      </g>
      <g fill="#D4D0D8" stroke="#8A8590" strokeWidth={1.2}>
        <circle cx={-26} cy={-3} r={4.5} />
        <circle cx={-21} cy={-8} r={3.2} />
        <circle cx={-31} cy={-8} r={2.4} />
      </g>
    </Place>
  ),
  beanie: ({ a }) => (
    <Place a={a}>
      <path d="M-19 -6 C-19 -20 -9 -23 0 -23 C9 -23 19 -20 19 -6 Z" fill="#4DB6AC" {...HAT_THIN} />
      <path d="M-10 -20 L-10 -8 M0 -22 L0 -8 M10 -20 L10 -8" stroke="#2F8F85" strokeWidth={1.3} strokeLinecap="round" />
      <rect x={-22} y={-8} width={44} height={13} rx={6} fill="#F5C242" {...HAT_THIN} />
      <path d="M-12 -7 L-12 4 M-4 -7 L-4 4 M4 -7 L4 4 M12 -7 L12 4" stroke="#C99A1C" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={0} cy={-24} r={5} fill="#FF8FA3" {...HAT_THIN} />
    </Place>
  ),
  bow: ({ a }) => (
    <Place a={a}>
      <g transform="translate(14 -1) rotate(-14)">
        <path d="M0 0 C-4 -9 -15 -10 -15 -2 C-15 6 -4 6 0 0 Z" fill="#FF6F9C" {...HAT_THIN} />
        <path d="M0 0 C4 -9 15 -10 15 -2 C15 6 4 6 0 0 Z" fill="#FF6F9C" {...HAT_THIN} />
        <path d="M-10 -4 L-6 -3 M10 -4 L6 -3" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
        <circle cx={0} cy={0} r={3.4} fill="#FF9DBB" {...HAT_THIN} />
      </g>
    </Place>
  ),
  flowerCrown: ({ a }) => {
    const fl: [number, number, string][] = [[-23, 8, '#FF8FB1'], [-12, 0, '#FFFFFF'], [0, -3, '#FFD54A'], [12, 0, '#FF8FB1'], [23, 8, '#FFFFFF']];
    return (
      <Place a={a}>
        <path d="M-27 12 Q0 -12 27 12" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        <path d="M-27 12 Q0 -12 27 12" fill="none" stroke="#6CC57F" strokeWidth={3} strokeLinecap="round" />
        {fl.map(([x, y, c]) => (
          <g key={x} transform={`translate(${x} ${y})`}>
            {[0, 72, 144, 216, 288].map((d) => (
              <circle key={d} cx={Math.cos((d * Math.PI) / 180) * 4} cy={Math.sin((d * Math.PI) / 180) * 4} r={3.1} fill={c} stroke={INK} strokeWidth={1.1} />
            ))}
            <circle cx={0} cy={0} r={2.4} fill={c === '#FFD54A' ? '#FF8FB1' : '#FFD54A'} />
          </g>
        ))}
      </Place>
    );
  },
  wizardHat: ({ a }) => (
    <Place a={a}>
      <ellipse cx={0} cy={3} rx={28} ry={5.5} fill="#3A4A9C" {...HAT_THIN} />
      <path d="M-17 3 L-9 -20 Q-3 -33 13 -39 Q9 -32 10 -22 L17 3 Q0 8 -17 3 Z" fill="#4A5CC0" {...HAT_THIN} />
      <path d="M-16 -4 L16 -4 L17 3 Q0 8 -17 3 Z" fill="#FFD54A" {...HAT_THIN} strokeWidth={1.4} />
      <path d="M0 -21 l1.8 4 l4.2 0.4 l-3.2 2.8 l1 4.2 l-3.8 -2.2 l-3.8 2.2 l1 -4.2 l-3.2 -2.8 l4.2 -0.4 Z" fill="#FFD54A" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={7} cy={-10} r={1.6} fill="#FFFFFF" />
      <circle cx={-8} cy={-14} r={1.3} fill="#FFFFFF" />
    </Place>
  ),
  pirateHat: ({ a }) => (
    <Place a={a}>
      <path d="M-30 2 Q-26 -14 -12 -20 Q0 -25 12 -20 Q26 -14 30 2 Q16 -4 0 -4 Q-16 -4 -30 2 Z" fill="#2D2A35" {...HAT_THIN} />
      <path d="M-30 2 Q-18 10 0 10 Q18 10 30 2 Q16 -4 0 -4 Q-16 -4 -30 2 Z" fill="#3D3846" {...HAT_THIN} />
      <circle cx={0} cy={-11} r={5} fill="#FFFFFF" {...HAT_THIN} strokeWidth={1.2} />
      <circle cx={-1.9} cy={-11.5} r={1.1} fill={INK} />
      <circle cx={1.9} cy={-11.5} r={1.1} fill={INK} />
      <path d="M-8 -5 L8 -16 M8 -5 L-8 -16" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />
      <path d="M-24 -4 Q-14 -12 -8 -14" stroke="#8B849A" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.6} />
    </Place>
  ),
  cowboyHat: ({ a }) => (
    <Place a={a}>
      <path d="M-33 -9 C-30 5 -12 7 0 7 C12 7 30 5 33 -9 C25 -3 14 -4 0 -4 C-14 -4 -25 -3 -33 -9 Z" fill="#C98F54" {...HAT_THIN} />
      <path d="M-15 -1 L-14 -17 Q-10 -23 -3 -19 Q0 -18 3 -19 Q10 -23 14 -17 L15 -1 Q0 4 -15 -1 Z" fill="#D9A268" {...HAT_THIN} />
      <path d="M-14.8 -6 L14.8 -6 L15 -1 Q0 4 -15 -1 Z" fill="#8B5A2B" {...HAT_THIN} strokeWidth={1.4} />
      <rect x={-3.5} y={-6.5} width={7} height={6} rx={1.5} fill="#FFD54A" {...HAT_THIN} strokeWidth={1.2} />
    </Place>
  ),
  headphones: ({ a }) => (
    <Place a={a}>
      <path d="M-30 18 C-30 -12 30 -12 30 18" fill="none" stroke={INK} strokeWidth={6.5} strokeLinecap="round" />
      <path d="M-30 18 C-30 -12 30 -12 30 18" fill="none" stroke="#7A8CF0" strokeWidth={3.6} strokeLinecap="round" />
      {([-1, 1] as const).map((s) => (
        <g key={s}>
          <rect x={s * 31 - 6.5} y={11} width={13} height={21} rx={6.5} fill="#FF7A8A" {...HAT_THIN} />
          <rect x={s * 31 - 3} y={15} width={6} height={13} rx={3} fill="#FFB3BC" />
        </g>
      ))}
    </Place>
  ),
  sunglasses: ({ a }) => (
    <Place a={a} at="eyes">
      <path d="M-7 -2 Q0 -6 7 -2" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M-26 -3 L-30 -2 M26 -3 L30 -2" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      {([-1, 1] as const).map((s) => (
        <g key={s}>
          <path d={`M${s * 6} -4 L${s * 25} -4 L${s * 25} 3 Q${s * 24} 11 ${s * 15} 11 Q${s * 7} 11 ${s * 6} 3 Z`} fill="#2A2A38" {...HAT_THIN} />
          <path d={`M${s * 10} 0 L${s * 13} -1 M${s * 10} 4 L${s * 17} 2`} stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
        </g>
      ))}
    </Place>
  ),
  glasses: ({ a }) => (
    <Place a={a} at="eyes">
      <path d="M-6 -1 Q0 -5 6 -1" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      <path d="M-25 -2 L-30 -3 M25 -2 L30 -3" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      {([-1, 1] as const).map((s) => (
        <g key={s}>
          <circle cx={s * 15.5} cy={0} r={9.5} fill="#BFE9FF" fillOpacity={0.28} {...HAT_THIN} />
          <path d={`M${s * 15.5 - 5.5} -4 Q${s * 15.5 - 3} -7 ${s * 15.5 + 1} -7`} fill="none" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
        </g>
      ))}
    </Place>
  ),
  heroMask: ({ a }) => (
    <Place a={a} at="eyes">
      <path
        fillRule="evenodd"
        d="M-28 -3 Q-28 -10 -20 -10 Q-10 -7 0 -8 Q10 -7 20 -10 Q28 -10 28 -3 Q28 8 18 10 Q10 10 6 3 Q0 1 -6 3 Q-10 10 -18 10 Q-28 8 -28 -3 Z M-21.5 0 a6 5 0 1 0 12 0 a6 5 0 1 0 -12 0 Z M9.5 0 a6 5 0 1 0 12 0 a6 5 0 1 0 -12 0 Z"
        fill="#E5484D"
        {...HAT_THIN}
      />
      <path d="M-22 -7 Q-14 -8 -8 -6 M22 -7 Q14 -8 8 -6" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.5} />
    </Place>
  ),
  bowTie: ({ a }) => (
    <Place a={a} at="neck">
      <path d="M0 4 L-15 -4 Q-18 4 -15 12 Z" fill="#5B8DEF" {...HAT_THIN} />
      <path d="M0 4 L15 -4 Q18 4 15 12 Z" fill="#5B8DEF" {...HAT_THIN} />
      <circle cx={-10} cy={4} r={1.2} fill="#FFFFFF" />
      <circle cx={10} cy={4} r={1.2} fill="#FFFFFF" />
      <rect x={-3.5} y={-0.5} width={7} height={9} rx={3} fill="#3F6FD0" {...HAT_THIN} strokeWidth={1.4} />
    </Place>
  ),
  bandana: ({ a }) => (
    <Place a={a} at="neck">
      <path d="M-26 -5 Q0 6 26 -5 L22 3 L3 24 Q0 27 -3 24 L-22 3 Z" fill="#F28C28" {...HAT_THIN} />
      <path d="M-26 -5 Q0 6 26 -5 L22 3 Q0 13 -22 3 Z" fill="#E0701A" {...HAT_THIN} strokeWidth={1.4} />
      <g fill="#FFF3D6">
        <circle cx={-8} cy={11} r={1.7} />
        <circle cx={6} cy={10} r={1.7} />
        <circle cx={-1} cy={17} r={1.7} />
        <circle cx={-14} cy={3} r={1.4} />
        <circle cx={14} cy={3} r={1.4} />
      </g>
    </Place>
  ),
  necklace: ({ a }) => (
    <Place a={a} at="neck">
      <path d="M-21 -5 Q0 17 21 -5" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M-21 -5 Q0 17 21 -5" fill="none" stroke="#FFD54A" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M0 18 C-10 11 -7 3 0 8 C7 3 10 11 0 18 Z" fill="#FF5C7A" {...HAT_THIN} strokeWidth={1.5} />
      <path d="M-4.5 9 Q-6 11 -4.5 13" stroke="#FFFFFF" strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.8} />
    </Place>
  ),
  cape: ({ a }) => (
    <Place a={a} at="neck">
      <path d="M-22 -10 Q-34 4 -46 25 Q-32 31 -16 26 Q0 32 16 26 Q32 31 46 25 Q34 4 22 -10 Z" fill="#D94A5C" {...HAT_THIN} />
      <path d="M-30 26 Q-27 8 -20 -4 M30 26 Q27 8 20 -4" stroke="#A9303F" strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </Place>
  ),
  wings: ({ a }) => (
    <Place a={a} at="neck">
      {([-1, 1] as const).map((s) => (
        <g key={s} transform={`scale(${s} 1)`}>
          <ellipse cx={-34} cy={-12} rx={24} ry={11} transform="rotate(-52 -34 -12)" fill="#CFE6FF" {...HAT_THIN} />
          <ellipse cx={-34} cy={9} rx={15} ry={8} transform="rotate(28 -34 9)" fill="#E3D6FF" {...HAT_THIN} />
          <path d="M-34 -8 Q-42 -20 -46 -28" stroke="#B9D9F2" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </Place>
  ),
  balloon: ({ a }) => (
    <Place a={a} at="neck">
      <path d="M22 10 Q36 0 32 -14 Q28 -24 44 -31" fill="none" stroke="#9A8C84" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M44 -32 L40.5 -28 L47.5 -28 Z" fill="#E0394F" {...HAT_THIN} strokeWidth={1.3} />
      <ellipse cx={44} cy={-45} rx={11} ry={13.5} fill="#FF5C7A" {...HAT_THIN} />
      <ellipse cx={40} cy={-50} rx={2.6} ry={4.5} transform="rotate(20 40 -50)" fill="#FFFFFF" opacity={0.6} />
    </Place>
  ),
};

/* ---------- extras ---------- */

export function Egg({ creature }: { creature: CreatureId }): JSX.Element {
  const { color } = CREATURES[creature];
  const idx = CREATURE_IDS.indexOf(creature);
  const shell = 'M60 16 C80 16 96 54 96 82 C96 100 80 110 60 110 C40 110 24 100 24 82 C24 54 40 16 60 16 Z';
  const dotsA: [number, number, number][] = [[46, 66, 7], [74, 54, 5], [68, 86, 8], [44, 92, 4.5], [58, 40, 4]];
  const dotsB: [number, number, number][] = [[72, 70, 8], [48, 56, 5.5], [56, 90, 7], [76, 94, 4], [42, 80, 3.5]];
  const dots = idx % 2 === 0 ? dotsA : dotsB;
  return (
    <g>
      <path d={shell} fill="#FFF7E8" />
      {dots.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={color} stroke={INK} strokeWidth={1} opacity={0.95} />
      ))}
      <path d="M62 26 l-6 8 l8 6 l-7 9" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={44} cy={46} rx={3} ry={6} transform="rotate(20 44 46)" fill="#FFFFFF" opacity={0.8} />
      <path d={shell} fill="none" {...OUT} />
    </g>
  );
}

export function Bed(): JSX.Element {
  return (
    <g>
      <ellipse cx={60} cy={103} rx={50} ry={11} fill="#E9A6BF" {...OUT} />
      <ellipse cx={60} cy={101} rx={40} ry={6.5} fill="#C97B9C" stroke={INK} strokeWidth={1.4} />
      <path d="M20 108 Q60 119 100 108" fill="none" stroke="#FFFFFF" strokeWidth={1.6} strokeDasharray="4 5" strokeLinecap="round" opacity={0.7} />
    </g>
  );
}

function Fluff({ x, y, r }: { x: number; y: number; r: number }): JSX.Element {
  const bumps = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return { bx: x + Math.cos(rad) * r * 0.85, by: y + Math.sin(rad) * r * 0.85, k: deg };
  });
  return (
    <g>
      {bumps.map((b) => (
        <circle key={b.k} cx={b.bx} cy={b.by} r={r * 0.5} fill="#CFCBD3" stroke="#6F6A78" strokeWidth={1.4} />
      ))}
      <circle cx={x} cy={y} r={r * 0.95} fill="#CFCBD3" />
      <circle cx={x - r * 0.32} cy={y - r * 0.05} r={r * 0.13 + 0.5} fill={INK} />
      <circle cx={x + r * 0.32} cy={y - r * 0.05} r={r * 0.13 + 0.5} fill={INK} />
    </g>
  );
}

export function DustBunnies(): JSX.Element {
  return (
    <g>
      <Fluff x={19} y={105} r={8} />
      <Fluff x={34} y={108} r={5.5} />
      <Fluff x={101} y={104} r={9} />
    </g>
  );
}
