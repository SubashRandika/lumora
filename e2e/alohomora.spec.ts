import { expect, test, type Page } from "@playwright/test";

/*
 * Alohomora end to end. The scene has no DOM, so these tests read how far the
 * unlocking is from rest (door opening, ward broken) from
 * `window.__chamberProbe.outcomeAmount`, which the chamber fills in only when
 * a test defines it.
 */

test.describe.configure({ timeout: 120_000 });

const chamber = (page: Page) => page.locator("section[data-chamber-state]");
const amount = (page: Page) =>
  page.evaluate(() => window.__chamberProbe?.outcomeAmount ?? Number.NaN);

async function openAlohomora(page: Page) {
  await page.addInitScript(() => {
    window.__chamberProbe = {};
    localStorage.setItem(
      "magic-words:settings",
      JSON.stringify({
        state: {
          graphics: "low",
          motion: "system",
          soundEnabled: true,
          musicEnabled: false,
          masterVolume: 0.7,
        },
        version: 1,
      }),
    );
  });
  await page.goto("/spells/alohomora/cast");
  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: 60_000,
  });
}

const waitForAmount = (page: Page, above: number) =>
  page.waitForFunction((a) => (window.__chamberProbe?.outcomeAmount ?? 0) > a, above, {
    timeout: 30_000,
  });

const spellButton = (page: Page, name: RegExp) =>
  page.getByRole("navigation", { name: "Choose a spell" }).getByRole("button", { name });

test("the ward breaks and the door swings open, and stays open", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openAlohomora(page);
  expect(await amount(page)).toBe(0);

  await page.getByRole("button", { name: "Cast Alohomora" }).click();
  await waitForAmount(page, 0.95);
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect");

  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page), "open after the spell").toBeGreaterThan(0.99);
  await page.waitForTimeout(1500);
  expect(await amount(page), "still open a while later").toBeGreaterThan(0.99);
  expect(errors).toEqual([]);
});

test("cast again closes the door, then opens it from the beginning", async ({ page }) => {
  await openAlohomora(page);
  await page.getByRole("button", { name: "Cast Alohomora" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0.99);

  // Record every frame from the click until the door is open again.
  const samples = await page.evaluate(async () => {
    const read = () => window.__chamberProbe?.outcomeAmount ?? 0;
    const again = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cast again"),
    );
    again?.click();
    const start = performance.now();
    const samples: number[] = [];
    let shut = false;
    while (performance.now() - start < 30_000) {
      await new Promise(requestAnimationFrame);
      const value = read();
      samples.push(value);
      if (value < 0.001) shut = true;
      if (shut && value > 0.95) break;
    }
    return samples;
  });

  const shutAt = samples.findIndex((value) => value < 0.001);
  expect(shutAt, "the door shuts and is warded again first").toBeGreaterThanOrEqual(0);
  expect(samples.at(-1)!, "then it opens again").toBeGreaterThan(0.95);
});

test("switching spells and coming back starts with the door shut", async ({ page }) => {
  await openAlohomora(page);
  await page.getByRole("button", { name: "Cast Alohomora" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0.99);

  await spellButton(page, /Wingardium Leviosa/).click();
  await expect(page).toHaveURL("/spells/wingardium-leviosa/cast");
  await spellButton(page, /Alohomora/).click();
  await expect(page).toHaveURL("/spells/alohomora/cast");
  await page.waitForFunction(() => window.__chamberProbe?.outcomeAmount === 0, null, {
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "Cast Alohomora" })).toBeVisible();
});

test("cancelling with the door open eases it shut", async ({ page }) => {
  await openAlohomora(page);
  await page.getByRole("button", { name: "Cast Alohomora" }).click();
  await waitForAmount(page, 0.9);

  // Cancel, then record the amount every frame inside the page until the door is at rest.
  const { before, samples } = await page.evaluate(async () => {
    const read = () => window.__chamberProbe?.outcomeAmount ?? 0;
    const before = read();
    const cancel = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cancel"),
    );
    cancel?.click();
    const start = performance.now();
    const samples: Array<{ at: number; amount: number }> = [];
    while (performance.now() - start < 4000) {
      await new Promise(requestAnimationFrame);
      const amount = read();
      samples.push({ at: performance.now() - start, amount });
      if (amount < 0.001) break;
    }
    return { before, samples };
  });
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "idle");

  const last = samples.at(-1)!;
  expect(last.amount, "the door comes to rest").toBeLessThan(0.001);
  expect(last.at, "within a few seconds").toBeLessThan(4000);

  // An ease, not a snap, unless software rendering skipped the whole 0.6 s return.
  const partWay = samples.some((s) => s.amount > 0.001 && s.amount < before * 0.97);
  const settledFrame = samples.findIndex((s) => s.amount < 0.001);
  const gap = settledFrame > 0 ? last.at - samples[settledFrame - 1]!.at : last.at;
  expect(partWay || gap > 500, JSON.stringify({ before, samples })).toBe(true);
});
