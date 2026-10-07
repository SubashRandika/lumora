"use client";

import Link from "next/link";
import { useRef, type RefObject } from "react";
import { SPELL_CATEGORIES } from "@/config/categories";
import { isCastPhase } from "@/domain/casting/castMachine";
import { describeWandMotion } from "@/domain/casting/wandPath";
import type { PerformanceTier } from "@/domain/performance/tier";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { WandSigil } from "@/components/spells/WandSigil";
import { cn } from "@/lib/cn";
import { CastControls, type VoiceControls } from "./CastControls";
import type { CastView } from "./useSpellCasting";

const TIER_LABELS: Record<PerformanceTier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

interface ChamberHudProps {
  spell: SpellDefinition;
  spells: readonly SpellDefinition[];
  onSelectSpell: (id: string) => void;
  cast: CastView;
  canCast: boolean;
  voice: VoiceControls | null;
  onCast: () => void;
  onCancel: () => void;
  tier: PerformanceTier;
  autoQuality: boolean;
  statsRef: RefObject<HTMLOutputElement | null>;
  showStats: boolean;
}

/** The chamber's minimal overlay: which spell, how to move the wand, and the cast controls. */
export function ChamberHud({
  spell,
  spells,
  onSelectSpell,
  cast,
  canCast,
  voice,
  onCast,
  onCancel,
  tier,
  autoQuality,
  statsRef,
  showStats,
}: ChamberHudProps) {
  const switcher = useRef<HTMLUListElement>(null);
  const casting = isCastPhase(cast.state);

  const focusSpellChoices = () => {
    const active = switcher.current?.querySelector<HTMLButtonElement>(
      "button[aria-pressed='true']",
    );
    const next = active?.closest("li")?.nextElementSibling?.querySelector("button");
    (next ?? switcher.current?.querySelector("button"))?.focus();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end">
      <div className="pointer-events-none absolute top-30 right-5 flex flex-col items-end gap-1 text-right text-xs text-vellum sm:top-20 sm:right-8">
        <Link href="/settings" className="pointer-events-auto hover:text-parchment">
          Graphics: {TIER_LABELS[tier]}
          {autoQuality ? " (auto)" : ""}
        </Link>
        {showStats && (
          <output ref={statsRef} className="font-mono text-[0.6875rem] text-vellum/80">
            measuring…
          </output>
        )}
      </div>

      <div className="bg-linear-to-t from-ink via-ink/85 to-transparent px-5 pt-16 pb-4 sm:px-8 sm:pt-24 sm:pb-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-10 gap-y-3 sm:gap-y-6">
          <div className="max-w-xl">
            <p className="eyebrow">
              {SPELL_CATEGORIES[spell.category].label}
              <span className="hidden sm:inline"> · {spell.name}</span>
            </p>
            <h1 className="mt-1 font-display text-title text-parchment sm:mt-2 sm:text-display">
              {spell.incantation}
            </h1>
            <p className="mt-1 text-sm text-parchment/80 sm:mt-2 sm:text-base">
              {describeWandMotion(spell.wandMotion)}
            </p>
          </div>

          <CastControls
            spell={spell}
            view={cast}
            canCast={canCast}
            voice={voice}
            onCast={onCast}
            onCancel={onCancel}
            onChooseAnother={focusSpellChoices}
          />
        </div>

        <nav
          aria-label="Choose a spell"
          className="pointer-events-auto mx-auto mt-6 max-w-6xl"
        >
          <ul
            ref={switcher}
            className="-mx-1 flex scrollbar-thin gap-2 overflow-x-auto px-1 pb-1"
          >
            {spells.map((option) => {
              const active = option.id === spell.id;
              return (
                <li key={option.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    disabled={casting && !active}
                    title={
                      casting && !active
                        ? "Finish or cancel the current cast first"
                        : undefined
                    }
                    onClick={() => onSelectSpell(option.id)}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-full border py-1 pr-4 pl-1 text-sm transition-[color,border-color,opacity] duration-300 ease-spell disabled:opacity-40",
                      active
                        ? "border-gold bg-gold/15 text-wandlight"
                        : "border-parchment/15 bg-ink/60 text-vellum enabled:hover:border-parchment/40 enabled:hover:text-parchment",
                    )}
                  >
                    <WandSigil spell={option} size={34} />
                    {option.incantation}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
