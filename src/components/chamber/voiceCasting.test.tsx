import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allSpells } from "@/data/spells";
import type {
  RecognitionResultList,
  SpeechRecognitionLike,
} from "@/features/spell-casting/voice/recognizer";
import { useVoiceCasting } from "./useVoiceCasting";
import { VoiceCastButton, VoiceStatus } from "./VoiceCastButton";

/** A stand-in for the browser's recogniser that tests can speak into. */
class FakeRecognition implements SpeechRecognitionLike {
  static current: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onresult: ((event: { results: RecognitionResultList }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  start() {
    FakeRecognition.current = this;
    this.started = true;
    this.onstart?.();
  }
  stop() {
    if (!this.started) return;
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.stop();
  }

  /** Deliver one phrase, with the recogniser's alternatives in order. */
  say(transcripts: readonly string[], final = true) {
    const alternatives: Record<number, { transcript: string }> = {};
    transcripts.forEach((transcript, i) => (alternatives[i] = { transcript }));
    const results = {
      length: 1,
      0: { length: transcripts.length, isFinal: final, ...alternatives },
    };
    this.onresult?.({ results: results as unknown as RecognitionResultList });
  }

  fail(error: string) {
    this.onerror?.({ error });
    this.stop();
  }
}

function Harness({ onCastSpell }: { onCastSpell: (id: string) => void }) {
  const voice = useVoiceCasting({ spells: allSpells, enabled: true, onCastSpell });
  if (!voice.supported) return <p>Voice casting is unavailable.</p>;
  return (
    <>
      <VoiceCastButton view={voice.view} enabled onToggle={voice.toggleListening} />
      <VoiceStatus view={voice.view} />
    </>
  );
}

const micButton = () => screen.getByRole("button");
const listen = () => userEvent.click(micButton());
const spoken = () => FakeRecognition.current!;
/** Speech arrives from outside React, so let it settle before asserting. */
const say = (transcripts: readonly string[], final = true) =>
  act(() => spoken().say(transcripts, final));
const fail = (error: string) => act(() => spoken().fail(error));

describe("voice casting", () => {
  beforeEach(() => {
    FakeRecognition.current = null;
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("casts the spell it hears", async () => {
    const onCastSpell = vi.fn();
    render(<Harness onCastSpell={onCastSpell} />);
    await listen();
    expect(micButton()).toHaveAttribute("aria-pressed", "true");

    say(["alohomora"]);
    expect(onCastSpell).toHaveBeenCalledWith("alohomora");
  });

  it("casts a spell other than the one on screen, so the wand can re-aim", async () => {
    const onCastSpell = vi.fn();
    render(<Harness onCastSpell={onCastSpell} />);
    await listen();
    say(["lacarnum inflamari"]);
    expect(onCastSpell).toHaveBeenCalledWith("lacarnum-inflamari");
  });

  it("casts through a mangled transcript, using every alternative offered", async () => {
    const onCastSpell = vi.fn();
    render(<Harness onCastSpell={onCastSpell} />);
    await listen();
    say(["a low more a", "alohamora"]);
    expect(onCastSpell).toHaveBeenCalledWith("alohomora");
  });

  it("shows the words as they arrive and keeps listening", async () => {
    render(<Harness onCastSpell={vi.fn()} />);
    await listen();
    expect(screen.getByText("Listening… say the incantation.")).toBeInTheDocument();

    say(["wingardium"], false);
    expect(screen.getByText("“wingardium”")).toBeInTheDocument();
    expect(micButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("casts nothing when the words aren't a spell, and says so", async () => {
    const onCastSpell = vi.fn();
    render(<Harness onCastSpell={onCastSpell} />);
    await listen();
    say(["what time is it"]);

    expect(onCastSpell).not.toHaveBeenCalled();
    expect(
      screen.getByText("That isn’t one of the seven. Say it again, a little slower."),
    ).toBeInTheDocument();
    expect(screen.getByText("“what time is it”")).toBeInTheDocument();
  });

  it("tells the caster how to fix a blocked microphone", async () => {
    render(<Harness onCastSpell={vi.fn()} />);
    await listen();
    fail("not-allowed");

    expect(
      screen.getByText("Microphone blocked. Allow it in your browser, then try again."),
    ).toBeInTheDocument();
  });

  it("stops listening when pressed a second time", async () => {
    render(<Harness onCastSpell={vi.fn()} />);
    await listen();
    const recognition = spoken();
    await listen();

    expect(recognition.started).toBe(false);
    expect(micButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("offers nothing where the browser can't listen", () => {
    vi.unstubAllGlobals();
    render(<Harness onCastSpell={vi.fn()} />);
    expect(screen.getByText("Voice casting is unavailable.")).toBeInTheDocument();
  });
});
