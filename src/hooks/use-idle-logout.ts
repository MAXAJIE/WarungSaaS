import { useEffect, useRef } from "react";

/**
 * Signs the staff account out after a period with no meaningful activity.
 * Approving orders, editing records, navigating the rail and typing all reset
 * the timer because they all bubble up as pointer / key / navigation events.
 */
export function useIdleLogout(minutes: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ms = minutes * 60_000;
    let timer = window.setTimeout(() => onIdleRef.current(), ms);

    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), ms);
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "focus",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener("visibilitychange", reset);

    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", reset);
    };
  }, [minutes]);
}
