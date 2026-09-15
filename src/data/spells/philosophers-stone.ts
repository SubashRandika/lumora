import type { SpellDefinition } from "@/domain/spells/spell.schema";

/*
 * Spells cast by incantation in "Philosopher's Stone" (book and/or 2001 film).
 *
 * Inclusion rule: the spell is cast with a spoken incantation in the work.
 * Chapter numbers refer to the UK edition. Descriptions are original
 * summaries; no text is quoted from the book or film.
 *
 * Deliberately excluded:
 *  - Ron's rhyme to turn Scabbers yellow (ch. 6 / film): a failed joke spell.
 *  - Hermione's bluebell flames and Quirrell's conjured ropes (book): cast
 *    without an incantation, so there is nothing to speak.
 *
 * Wand motions are original interpretations except where the work specifies
 * one (the swish and flick of Wingardium Leviosa).
 */

const WORK = "philosophers-stone";

export const philosophersStoneSpells: readonly SpellDefinition[] = [
  {
    id: "wingardium-leviosa",
    name: "Levitation Charm",
    incantation: "Wingardium Leviosa",
    pronunciation: "win-GAR-dee-um lev-ee-OH-sa",
    summary: "Lifts an object into the air and holds it there.",
    description:
      "Lifts an object off the ground and holds it floating in the air. It is one of the first charms young witches and wizards learn, and it needs clear pronunciation and a clean swish and flick.",
    category: "charms",
    difficulty: "beginner",
    appearances: [
      { medium: "book", workId: WORK, chapter: 10 },
      { medium: "film", workId: WORK },
    ],
    wandMotion: { type: "swish-and-flick", duration: 0.9, easing: "ease-in-out" },
    // The effect phase fits the whole float: 1.5 s up, 3 s aloft, 1.5 s down, a short settle.
    timeline: { preparing: 0.4, casting: 1.2, projectile: 0.7, impact: 0.3, effect: 6.5 },
    visualEffect: {
      palette: { core: "#EAF2FF", glow: "#9CC3DF" },
      projectile: { kind: "magic-orb", size: 0.12, trail: true, glow: 0.8 },
      particles: ["sparkles", "magic-trail", "energy"],
      outcome: { kind: "levitate", liftHeight: 1.4, hoverSeconds: 3, spinTurns: 0.5 },
    },
    environmentEffects: [
      { kind: "dust-rise", intensity: 0.7 },
      { kind: "candle-flicker", intensity: 0.4 },
    ],
    sound: {
      charge: "charge-soft",
      cast: "cast-chime",
      impact: "impact-shimmer",
      ambient: "float-shimmer",
      settle: "land-soft",
    },
    target: { model: "tome" },
  },
  {
    id: "alohomora",
    name: "Unlocking Charm",
    incantation: "Alohomora",
    pronunciation: "ah-LOH-ho-MOR-ah",
    summary: "Opens a locked door or lock.",
    description:
      "Springs open locks and unbolts doors that aren't protected by stronger magic. It is so easily misused that well-guarded places set wards against it.",
    category: "charms",
    difficulty: "beginner",
    appearances: [
      { medium: "book", workId: WORK, chapter: 9 },
      { medium: "film", workId: WORK },
    ],
    wandMotion: {
      type: "custom",
      points: [
        { x: 0, y: -0.2 },
        { x: 0, y: 0.25, z: 0.4 },
        { x: 0.2, y: 0.2, z: 0.4 },
        { x: 0.3, y: 0, z: 0.4 },
      ],
      description: "Push the wand up and forward, then turn it over like a key.",
      duration: 0.8,
      easing: "snap",
    },
    // The effect phase fits the unlocking: the ward breaks and the door swings open and settles.
    // The door stays open afterwards; the next cast closes it and starts again.
    timeline: { preparing: 0.3, casting: 1, projectile: 0.5, impact: 0.4, effect: 3.5 },
    visualEffect: {
      palette: { core: "#FFE6A8", glow: "#C29D5B" },
      projectile: { kind: "spark", size: 0.08, trail: true, glow: 0.7 },
      particles: ["sparkles", "impact-burst"],
      outcome: { kind: "unlock" },
    },
    environmentEffects: [
      { kind: "candle-flicker", intensity: 0.3 },
      { kind: "chamber-brighten", intensity: 0.2 },
    ],
    sound: {
      cast: "cast-click",
      impact: "impact-latch",
      moments: {
        "ward-break": "ward-shatter",
        unlatch: "shackle-spring",
        "swing-open": "door-creak",
      },
    },
    target: { model: "warded-door" },
  },
  {
    id: "petrificus-totalus",
    name: "Full Body-Bind Curse",
    incantation: "Petrificus Totalus",
    pronunciation: "pe-TRI-fi-kus toh-TAH-lus",
    summary: "Locks the target's whole body rigid.",
    description:
      "Snaps the target's arms and legs together and freezes their whole body stiff. They stay aware but can't move until the curse is lifted, so it stops someone without harming them.",
    category: "curses",
    difficulty: "intermediate",
    appearances: [
      { medium: "book", workId: WORK, chapter: 16 },
      { medium: "film", workId: WORK },
    ],
    wandMotion: { type: "jab", duration: 0.5, easing: "snap" },
    // The effect phase fits the binding: arms clamp, frost climbs, and it rocks and settles.
    // It stays frozen afterwards; the next cast thaws it and starts again.
    timeline: { preparing: 0.3, casting: 0.9, projectile: 0.4, impact: 0.4, effect: 3.2 },
    visualEffect: {
      palette: { core: "#F5FAFF", glow: "#7FA8D1" },
      projectile: { kind: "ray", size: 0.06, trail: false, glow: 0.9 },
      particles: ["impact-burst", "energy"],
      outcome: { kind: "petrify" },
    },
    environmentEffects: [
      { kind: "tremor", intensity: 0.3 },
      { kind: "chamber-dim", intensity: 0.2 },
    ],
    sound: {
      cast: "cast-crack",
      impact: "impact-freeze",
      moments: {
        bind: "limb-clack",
        freeze: "frost-crackle",
        rock: "stone-knock",
      },
    },
    target: { model: "practice-mannequin" },
  },
  {
    id: "locomotor-mortis",
    name: "Leg-Locker Curse",
    incantation: "Locomotor Mortis",
    pronunciation: "loh-koh-MOH-tor MOR-tis",
    summary: "Binds the target's legs together.",
    description:
      "Clamps the target's legs together, leaving them to hop about or topple over. It's a schoolyard curse, more embarrassing than dangerous, and easy to undo.",
    category: "curses",
    difficulty: "intermediate",
    appearances: [{ medium: "book", workId: WORK, chapter: 13 }],
    notes: "Appears in the book only; the 2001 film omits the scene.",
    wandMotion: { type: "downward", duration: 0.6, easing: "ease-in" },
    // The effect phase fits the binding: bands wrap and cinch, it hops and teeters, then stands.
    // It stays bound afterwards; the next cast releases it and starts again.
    timeline: { preparing: 0.3, casting: 0.9, projectile: 0.5, impact: 0.3, effect: 3.7 },
    visualEffect: {
      palette: { core: "#E9DDFF", glow: "#9A86C9" },
      projectile: { kind: "spark", size: 0.07, trail: true, glow: 0.6 },
      particles: ["magic-trail", "impact-burst"],
      outcome: { kind: "leg-lock" },
    },
    environmentEffects: [{ kind: "dust-rise", intensity: 0.3 }],
    sound: {
      cast: "cast-snap",
      impact: "impact-bind",
      moments: {
        bands: "band-wrap",
        cinch: "band-cinch",
        hop: "hop-thud",
        teeter: "teeter-creak",
      },
    },
    target: { model: "practice-mannequin" },
  },
  {
    id: "oculus-reparo",
    name: "Spectacle-Mending Charm",
    incantation: "Oculus Reparo",
    pronunciation: "OK-yoo-lus reh-PAR-oh",
    summary: "Mends broken glasses in an instant.",
    description:
      "Mends broken spectacles in an instant. Cracks close, loose shards fly back into place, and the lenses come back clear.",
    category: "charms",
    difficulty: "beginner",
    appearances: [{ medium: "film", workId: WORK }],
    notes: "Film only. The book has no equivalent scene.",
    wandMotion: { type: "circle", duration: 0.7, easing: "ease-in-out" },
    // The effect phase fits the mending: lift, the crack glows, shards return, it seals, rings sweep.
    // They stay mended afterwards; the next cast cracks them again and starts again.
    timeline: { preparing: 0.3, casting: 0.9, projectile: 0, impact: 0.2, effect: 3 },
    visualEffect: {
      palette: { core: "#FFFFFF", glow: "#CFE3F2" },
      projectile: null,
      particles: ["sparkles", "energy"],
      outcome: { kind: "mend" },
    },
    environmentEffects: [{ kind: "chamber-brighten", intensity: 0.2 }],
    sound: {
      charge: "charge-soft",
      impact: "impact-mend",
      moments: {
        "crack-glow": "glass-hum",
        shards: "shard-tinkle",
        seal: "lens-seal",
        ring: "ring-sweep",
      },
    },
    target: { model: "cracked-spectacles" },
  },
  {
    id: "lumos-solem",
    name: "Sunlight Charm",
    incantation: "Lumos Solem",
    pronunciation: "LOO-mos SOH-lem",
    summary: "Throws a burst of sunlight from the wand.",
    description:
      "Releases a blaze of true sunlight from the tip of the wand, far brighter than ordinary wand-light. Creatures and plants that shun daylight shrink back from it.",
    category: "charms",
    difficulty: "intermediate",
    appearances: [{ medium: "film", workId: WORK }],
    notes:
      "Film only. In the book, the same plant is driven back with conjured fire and no incantation is spoken.",
    wandMotion: { type: "upward", duration: 0.7, easing: "ease-out" },
    // The effect phase fits the sunburst: the light blooms, the vines recoil, retreat into the pot, the light softens.
    // They stay withered back afterwards; the next cast grows them back and starts again.
    timeline: { preparing: 0.5, casting: 1.3, projectile: 0.6, impact: 0.3, effect: 3.5 },
    visualEffect: {
      palette: { core: "#FFF4D6", glow: "#FFC96B" },
      projectile: { kind: "energy-beam", size: 0.2, trail: false, glow: 1 },
      particles: ["energy", "dust"],
      outcome: { kind: "sunburst", intensity: 1 },
    },
    environmentEffects: [
      { kind: "chamber-brighten", intensity: 1 },
      { kind: "dust-rise", intensity: 0.4 },
    ],
    sound: {
      charge: "charge-rising",
      cast: "cast-flare",
      impact: "impact-sunburst",
      moments: {
        flare: "sun-bloom",
        recoil: "leaf-rustle",
        retreat: "vine-slither",
      },
    },
    target: { model: "creeping-vines" },
  },
  {
    id: "lacarnum-inflamari",
    name: "Fire-Making Spell",
    incantation: "Lacarnum Inflamari",
    pronunciation: "la-KAR-num in-fla-MAR-ee",
    summary: "Sets a small, sudden fire at a distance.",
    description:
      "Throws a small ball of flame that sets fabric and other flammable things alight. It's meant to startle or distract rather than destroy.",
    category: "charms",
    difficulty: "intermediate",
    appearances: [{ medium: "film", workId: WORK }],
    notes:
      "Film only, and whispered on screen. The spelling isn't fixed by any published text, so variants such as “Lacarnum Inflamarae” exist.",
    wandMotion: { type: "flick", duration: 0.5, easing: "snap" },
    // The effect phase fits the burn: the flame catches, climbs for flameSeconds, and dies down.
    // The cloak stays charred and smouldering afterwards; the next cast restores it and starts again.
    timeline: { preparing: 0.3, casting: 1, projectile: 0.6, impact: 0.3, effect: 3.6 },
    visualEffect: {
      palette: { core: "#FFD9A0", glow: "#E0703A" },
      projectile: { kind: "magic-orb", size: 0.1, trail: true, glow: 0.9 },
      particles: ["embers", "smoke"],
      outcome: { kind: "ignite", flameSeconds: 2.5 },
    },
    environmentEffects: [
      { kind: "candle-flicker", intensity: 0.8 },
      { kind: "chamber-brighten", intensity: 0.3 },
    ],
    sound: {
      cast: "cast-whoosh",
      impact: "impact-ignite",
      moments: {
        kindle: "flame-catch",
        blaze: "fire-roar",
        douse: "fire-hiss",
      },
    },
    target: { model: "cloak-stand" },
  },
];
