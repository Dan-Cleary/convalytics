import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(target: number, duration?: number): number;
export function useAnimatedNumber(
  target: number | undefined,
  duration?: number,
): number | undefined;
export function useAnimatedNumber(
  target: number | undefined,
  duration = 400,
): number | undefined {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>(0);
  const startRef = useRef<{ from: number; to: number; t0: number } | null>(
    null,
  );

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      return;
    }
    const from = display ?? 0;
    if (from === target) {
      setDisplay(target);
      return;
    }
    startRef.current = { from, to: target, t0: performance.now() };

    function tick(now: number) {
      const s = startRef.current;
      if (!s) return;
      const elapsed = now - s.t0;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(s.from + (s.to - s.from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}
