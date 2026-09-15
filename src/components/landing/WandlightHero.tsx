"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import styles from "./WandlightHero.module.css";
import {
  buildWallRows,
  distance,
  driftPosition,
  easeToward,
  REST_POSITION,
  type Point,
} from "./wandlight";

const ROW_COUNT = 8;
/** Seconds without pointer input before the light starts drifting on its own. */
const IDLE_BEFORE_DRIFT = 3.5;
/** Total length of the enter-the-chamber sequence, matched to the CSS transitions. */
const ENTER_DURATION_MS = 950;

interface WandlightContextValue {
  enter: (href: Route) => void;
}

const WandlightContext = createContext<WandlightContextValue | null>(null);

export function useWandlight(): WandlightContextValue {
  const context = useContext(WandlightContext);
  if (!context) throw new Error("useWandlight must be used inside <WandlightHero>");
  return context;
}

interface WandlightHeroProps {
  incantations: readonly string[];
  labelledBy: string;
  children: ReactNode;
}

export function WandlightHero({
  incantations,
  labelledBy,
  children,
}: WandlightHeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const enteringRef = useRef(false);
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const rows = useMemo(() => buildWallRows(incantations, ROW_COUNT), [incantations]);

  useLightFollower(heroRef, reducedMotion);

  const enter = useCallback(
    (href: Route) => {
      const hero = heroRef.current;
      if (enteringRef.current) return;
      enteringRef.current = true;
      if (reducedMotion || !hero) {
        router.push(href);
        return;
      }
      hero.dataset.entering = "true";
      window.setTimeout(() => router.push(href), ENTER_DURATION_MS);
    },
    [reducedMotion, router],
  );

  const context = useMemo(() => ({ enter }), [enter]);

  const wall = (
    <>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.row}>
          {row.map((incantation, i) => (
            <span key={i} className="contents">
              <span>{incantation}</span>
              <span className={styles.separator}>✦</span>
            </span>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <WandlightContext.Provider value={context}>
      <section ref={heroRef} aria-labelledby={labelledBy} className={styles.hero}>
        <div aria-hidden="true">
          <div className={`${styles.wall} ${styles.engraved}`}>{wall}</div>
          <div className={styles.glow} />
          <div className={`${styles.wall} ${styles.lit}`}>{wall}</div>
          <div className={styles.scrim} />
          <div className={styles.flare} />
        </div>
        {children}
        <div aria-hidden="true" className={styles.veil} />
      </section>
    </WandlightContext.Provider>
  );
}

/**
 * Moves the light toward the pointer with a slight lag, as if carried. When
 * nobody steers it, it drifts slowly. It pauses when the hero is off screen
 * or the tab is hidden, and never re-renders React.
 */
function useLightFollower(
  heroRef: RefObject<HTMLElement | null>,
  reducedMotion: boolean,
) {
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    let current: Point = { ...REST_POSITION };
    let target: Point = { ...REST_POSITION };
    let lastInputAt = -Infinity;
    let lastFrameAt = performance.now();
    let frame = 0;
    let visible = true;

    const write = (point: Point) => {
      hero.style.setProperty("--light-x", `${(point.x * 100).toFixed(2)}%`);
      hero.style.setProperty("--light-y", `${(point.y * 100).toFixed(2)}%`);
    };

    const tick = (now: number) => {
      frame = 0;
      const delta = (now - lastFrameAt) / 1000;
      lastFrameAt = now;

      const idle = (now - lastInputAt) / 1000 > IDLE_BEFORE_DRIFT;
      if (idle && !reducedMotion) target = driftPosition(now / 1000);

      current = reducedMotion ? target : easeToward(current, target, delta);
      write(current);

      // Keep animating while drifting or still catching up; otherwise sleep until input.
      const settled = distance(current, target) < 0.0005;
      if (visible && (!settled || (idle && !reducedMotion))) schedule();
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = hero.getBoundingClientRect();
      if (event.clientY > rect.bottom || event.clientY < rect.top) return;
      target = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
      lastInputAt = performance.now();
      schedule();
    };

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) {
        lastFrameAt = performance.now();
        schedule();
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting) && document.visibilityState === "visible";
      if (visible) {
        lastFrameAt = performance.now();
        schedule();
      }
    });
    observer.observe(hero);

    hero.addEventListener("pointermove", onPointer, { passive: true });
    hero.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      hero.removeEventListener("pointermove", onPointer);
      hero.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [heroRef, reducedMotion]);
}
