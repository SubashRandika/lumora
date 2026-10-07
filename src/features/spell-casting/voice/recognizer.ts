/*
 * A thin wrapper over the browser's speech recogniser, shaped like the rest of
 * the casting inputs: start it, listen for events, stop it. Nothing here knows
 * about spells — matching is pure and lives in src/domain/voice.
 *
 * The Web Speech API is unprefixed in Edge and prefixed in Chrome and Safari;
 * Firefox has none, and callers check `isVoiceCastingSupported()` first.
 * Recognition happens on the browser's own terms: Chrome sends the audio to
 * Google for transcription, which the UI says out loud before the mic opens.
 */

export type VoiceProblem =
  /** The caster denied the microphone, or the browser blocks it on this page. */
  | "blocked"
  /** The mic opened but nothing was said. */
  | "no-speech"
  /** No microphone to record from. */
  | "no-microphone"
  /** The recogniser couldn't reach its service. */
  | "offline"
  | "unknown";

export type VoiceEvent =
  /** The microphone is open. */
  | { type: "listening" }
  /** Words so far. `final` marks the recogniser's last word on the phrase. */
  | { type: "heard"; transcripts: readonly string[]; final: boolean }
  | { type: "problem"; problem: VoiceProblem }
  /** The microphone is closed, however it ended. */
  | { type: "ended" };

export interface VoiceRecognizer {
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface RecognitionAlternative {
  readonly transcript: string;
}
export interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
export interface RecognitionResultList {
  readonly length: number;
  [index: number]: RecognitionResult;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Whether this browser can listen at all. False in Firefox and during SSR. */
export function isVoiceCastingSupported(): boolean {
  return Boolean(getConstructor());
}

const PROBLEMS: Record<string, VoiceProblem> = {
  "not-allowed": "blocked",
  "service-not-allowed": "blocked",
  "no-speech": "no-speech",
  "audio-capture": "no-microphone",
  network: "offline",
};

/** Every alternative the recogniser offers for the current phrase. */
function readTranscripts(results: RecognitionResultList): string[] {
  const transcripts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    for (let j = 0; j < result.length; j++) {
      const { transcript } = result[j]!;
      if (transcript.trim()) transcripts.push(transcript);
    }
  }
  return transcripts;
}

export interface VoiceRecognizerOptions {
  language: string;
  maxAlternatives: number;
  onEvent: (event: VoiceEvent) => void;
  /** Swapped for a fake in tests. */
  create?: () => SpeechRecognitionLike;
}

/** Returns null where the browser can't listen. */
export function createVoiceRecognizer({
  language,
  maxAlternatives,
  onEvent,
  create,
}: VoiceRecognizerOptions): VoiceRecognizer | null {
  const make = create ?? (() => new (getConstructor()!)());
  if (!create && !isVoiceCastingSupported()) return null;

  let recognition: SpeechRecognitionLike | null = null;
  let running = false;
  let disposed = false;

  const detach = () => {
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onaudiostart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition = null;
  };

  return {
    start() {
      if (disposed || running) return;
      running = true;
      const instance = make();
      recognition = instance;
      instance.lang = language;
      // One phrase per press: the mic closes as soon as a spell is spoken.
      instance.continuous = false;
      instance.interimResults = true;
      instance.maxAlternatives = maxAlternatives;
      instance.onstart = () => onEvent({ type: "listening" });
      instance.onresult = (event) => {
        const results = event.results;
        const last = results[results.length - 1];
        onEvent({
          type: "heard",
          transcripts: readTranscripts(results),
          final: Boolean(last?.isFinal),
        });
      };
      instance.onerror = (event) => {
        // "aborted" is this code calling stop(); it isn't a problem to report.
        if (event.error === "aborted") return;
        onEvent({ type: "problem", problem: PROBLEMS[event.error] ?? "unknown" });
      };
      instance.onend = () => {
        running = false;
        detach();
        onEvent({ type: "ended" });
      };
      try {
        instance.start();
      } catch {
        // Chrome throws if a previous session hasn't finished closing.
        running = false;
        detach();
        onEvent({ type: "problem", problem: "unknown" });
        onEvent({ type: "ended" });
      }
    },

    stop() {
      if (!running || !recognition) return;
      try {
        recognition.stop();
      } catch {
        // Already stopping; `onend` still fires.
      }
    },

    dispose() {
      disposed = true;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // Nothing to abort.
        }
        detach();
      }
      running = false;
    },
  };
}
