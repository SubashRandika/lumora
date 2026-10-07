import { expect, test, type Page } from "@playwright/test";

/*
 * Voice casting end to end. A real browser won't transcribe anything in CI, so
 * the Web Speech API is replaced before the app loads with a stand-in the test
 * can speak into: `window.__say(["alohomora"])`.
 */

test.describe.configure({ timeout: 120_000 });

const chamber = (page: Page) => page.locator("section[data-chamber-state]");
const amount = (page: Page) =>
  page.evaluate(() => window.__chamberProbe?.outcomeAmount ?? Number.NaN);
// The button's accessible name changes while it listens, so tests hold on to
// `data-voice`, which carries the listening state instead.
const microphone = (page: Page) => page.locator("button[data-voice]");

async function openChamber(page: Page, spellId: string) {
  await page.addInitScript(() => {
    window.__chamberProbe = {};
    localStorage.setItem(
      "magic-words:settings",
      JSON.stringify({
        state: {
          graphics: "low",
          motion: "system",
          soundEnabled: false,
          musicEnabled: false,
          masterVolume: 0.7,
          voiceEnabled: true,
        },
        version: 1,
      }),
    );

    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onaudiostart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { __recognition: FakeRecognition }).__recognition = this;
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      FakeRecognition;

    (window as unknown as { __say: (t: string[], final?: boolean) => void }).__say = (
      transcripts,
      final = true,
    ) => {
      const recognition = (window as unknown as { __recognition?: FakeRecognition })
        .__recognition;
      const alternatives: Record<number, { transcript: string }> = {};
      transcripts.forEach((transcript, i) => (alternatives[i] = { transcript }));
      recognition?.onresult?.({
        results: {
          length: 1,
          0: { length: transcripts.length, isFinal: final, ...alternatives },
        },
      });
    };
  });

  await page.goto(`/spells/${spellId}/cast`);
  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: 60_000,
  });
}

const say = (page: Page, transcripts: string[], final = true) =>
  page.evaluate(
    ([t, f]) =>
      (window as unknown as { __say: (t: string[], final?: boolean) => void }).__say(
        t as string[],
        f as boolean,
      ),
    [transcripts, final] as const,
  );

test("speaking the incantation casts the spell on screen", async ({ page }) => {
  await openChamber(page, "wingardium-leviosa");
  await microphone(page).click();
  await expect(microphone(page)).toHaveAttribute("data-voice", "listening");

  await say(page, ["wingardium leviosa"]);

  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect", {
    timeout: 30_000,
  });
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0);
});

test("speaking another spell turns the chamber to it and casts that one", async ({
  page,
}) => {
  await openChamber(page, "wingardium-leviosa");
  await microphone(page).click();

  await say(page, ["alohomora"]);

  // The chamber swaps to the warded door before the wand goes up.
  await expect(page.getByRole("heading", { name: "Alohomora" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page).toHaveURL(/\/spells\/alohomora\/cast$/);
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect", {
    timeout: 30_000,
  });
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test("a mangled incantation still casts", async ({ page }) => {
  await openChamber(page, "petrificus-totalus");
  await microphone(page).click();

  await say(page, ["petrificus totalis"]);

  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect", {
    timeout: 30_000,
  });
});

test("words that aren't a spell cast nothing and say what was heard", async ({
  page,
}) => {
  await openChamber(page, "wingardium-leviosa");
  await microphone(page).click();

  await say(page, ["what time is it"]);

  await expect(microphone(page)).toHaveAttribute("data-voice", "missed");
  await expect(page.getByText("“what time is it”")).toBeVisible();
  await expect(
    page.getByText("That isn’t one of the seven. Say it again, a little slower."),
  ).toBeVisible();
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "idle");
});

test("the microphone is hidden when voice casting is switched off", async ({ page }) => {
  await openChamber(page, "wingardium-leviosa");
  await expect(microphone(page)).toBeVisible();

  await page.getByRole("link", { name: /Graphics:/ }).click();
  await page.getByRole("switch", { name: "Cast by voice" }).click();
  await page.goBack();

  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: 60_000,
  });
  await expect(microphone(page)).toBeHidden();
});
