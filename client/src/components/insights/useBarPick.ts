import { useEffect, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

type Pick = { key: string; index: number } | null;

/**
 * A bar chart's picked bar. A tap, click or keyboard focus pins one; a mouse hover shows one only while the
 * pointer is over the chart. `shown` (hover first, then the pinned bar) is the one to dim around and read out.
 * Both reset when `key` (the data behind the bars) changes.
 */
export function useBarPick(key: string) {
  const [picked, setPicked] = useState<Pick>(null);
  const [hover, setHover] = useState<Pick>(null);
  const selected = picked?.key === key ? picked.index : null;
  const hovered = hover?.key === key ? hover.index : null;
  return {
    selected,
    hovered,
    shown: hovered ?? selected,
    onSelect: (i: number | null) => setPicked(i == null ? null : { key, index: i }),
    onHover: (i: number | null) => setHover(i == null ? null : { key, index: i }),
  };
}

/** Props for bar i's hit target. A mouse hover only previews; a click or tap pins, and tapping the pinned bar unpins it. */
export function barHit(i: number, selected: number | null, onSelect: (i: number | null) => void, onHover: (i: number | null) => void) {
  return {
    onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') onHover(i); },
    // A click or tap doesn't focus the bar, so onFocus only comes from the keyboard
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    onClick: () => onSelect(selected === i ? null : i),
    onFocus: () => onSelect(i),
  };
}

/** A tap or click anywhere outside the chart unpins its bar. */
export function useUnpinOutside(ref: RefObject<HTMLElement | null>, selected: number | null, onSelect: (i: null) => void) {
  useEffect(() => {
    if (selected == null) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onSelect(null); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [ref, selected, onSelect]);
}
