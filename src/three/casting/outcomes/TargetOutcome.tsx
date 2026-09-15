import type { ReactNode } from "react";
import type { QualityProfile } from "@/config/performance";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { DoorUnlock } from "./DoorUnlock";
import { Ignition } from "./Ignition";
import { LegLock } from "./LegLock";
import { Levitation } from "./Levitation";
import { Mending } from "./Mending";
import { Petrification } from "./Petrification";
import { resolveOutcomePerformer, type OutcomeKind } from "./resolve";
import { Sunburst } from "./Sunburst";
import { TargetSwell } from "./TargetSwell";

export interface OutcomeProps {
  spell: SpellDefinition;
  quality: QualityProfile;
}

type RenderOutcome = (props: OutcomeProps, key: string) => ReactNode;

/**
 * One performer per outcome kind, chosen from the spell's data. Add an entry
 * here to give an outcome its own animation; the rest get the generic swell.
 */
const OUTCOME_PERFORMERS: Partial<Record<OutcomeKind, RenderOutcome>> = {
  levitate: (props, key) => <Levitation key={key} {...props} />,
  unlock: (props, key) => <DoorUnlock key={key} {...props} />,
  petrify: (props, key) => <Petrification key={key} {...props} />,
  "leg-lock": (props, key) => <LegLock key={key} {...props} />,
  mend: (props, key) => <Mending key={key} {...props} />,
  sunburst: (props, key) => <Sunburst key={key} {...props} />,
  ignite: (props, key) => <Ignition key={key} {...props} />,
};

const renderGeneric: RenderOutcome = (_props, key) => <TargetSwell key={key} />;

/** What happens to the target: mounts the performer for the current spell's outcome. */
export function TargetOutcome(props: OutcomeProps) {
  const kind = props.spell.visualEffect.outcome.kind;
  const render = resolveOutcomePerformer(OUTCOME_PERFORMERS, kind, renderGeneric);
  // Keyed by target model too, so a new prop gets a fresh performer.
  return render(props, `${kind}:${props.spell.target.model}`);
}
