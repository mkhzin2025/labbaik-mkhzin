import { useEffect, useRef, useState } from 'react';
import { toEnglishDigits } from '@/lib/utils';

export interface CountUpProps {
  /** A number, or already-formatted text such as "1,240", "45%" or "3 س 5 د" — every number in it counts up. */
  value: string | number;
  duration?: number;
  className?: string;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const parse = (text: string) => (text.match(NUMBER) || []).map((t) => Number(t.replace(/,/g, '')));
const decimalsOf = (token: string) => token.split('.')[1]?.length ?? 0;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function render(text: string, numbers: number[]) {
  let i = 0;
  return text.replace(NUMBER, (token) => {
    const n = numbers[i++];
    const decimals = decimalsOf(token);
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: token.includes(',') || n >= 1000,
    });
  });
}

/**
 * Animates the numbers in `value` from what was last shown (0 on first render) to their new values,
 * keeping any surrounding text. Screen readers get the final text only.
 */
export function CountUp({ value, duration = 900, className }: CountUpProps) {
  const text = typeof value === 'number' ? value.toLocaleString('en-US') : toEnglishDigits(value);
  const shown = useRef<number[]>([]);
  const [display, setDisplay] = useState(() => render(text, parse(text).map(() => 0)));

  useEffect(() => {
    const target = parse(text);
    const from = target.map((_, i) => shown.current[i] ?? 0);
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches || target.every((n, i) => n === from[i]);
    const ms = instant ? 0 : duration;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ms ? Math.min(1, (now - start) / ms) : 1;
      if (t === 1) {
        shown.current = target;
        setDisplay(text);
        return;
      }
      const k = easeOutCubic(t);
      const current = target.map((n, i) => {
        const v = from[i] + (n - from[i]) * k;
        return Number.isInteger(n) ? Math.round(v) : v;
      });
      shown.current = current;
      setDisplay(render(text, current));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration]);

  return (
    <span className={className}>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
