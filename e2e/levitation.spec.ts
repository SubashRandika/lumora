import { expect, test, type Page } from "@playwright/test";

/*
 * Wingardium Leviosa end to end. The scene has no DOM, so these tests read
 * the book's height from `window.__chamberProbe`, which the chamber fills in
 * only when a test defines it.
 */

test.describe.configure({ timeout: 120_000 });

const chamber = (page: Page) => page.locator("section[data-chamber-state]");
const lift = (page: Page) =>
  page.evaluate(() => window.__chamberProbe?.targetLift ?? Number.NaN);

async function openLeviosa(page: Page) {
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
  await page.goto("/spells/wingardium-leviosa/cast");
  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: 60_000,
  });
}

const waitForLift = (page: Page, above: number) =>
  page.waitForFunction((h) => (window.__chamberProbe?.targetLift ?? 0) > h, above, {
    timeout: 30_000,
  });

test("the book lifts, hovers, and settles back on the pedestal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openLeviosa(page);
  expect(await lift(page)).toBe(0);

  await page.getByRole("button", { name: "Cast Wingardium Leviosa" }).click();
  await waitForLift(page, 1.2);
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect");

  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await lift(page)).toBeLessThan(0.005);
  expect(
    await page.evaluate(() => window.__chamberProbe?.maxTargetLift ?? 0),
  ).toBeLessThan(1.6);
  expect(errors).toEqual([]);

  // Cast again starts from rest and floats the book again.
  await page.evaluate(() => {
    window.__chamberProbe = {};
  });
  await page.getByRole("button", { name: "Cast again" }).click();
  await waitForLift(page, 1);
});

test("cancelling mid-float glides the book back to rest", async ({ page }) => {
  await openLeviosa(page);
  await page.getByRole("button", { name: "Cast Wingardium Leviosa" }).click();
  await waitForLift(page, 0.8);

  // Cancel, then record the height every frame inside the page until the book is at rest.
  const { before, samples } = await page.evaluate(async () => {
    const read = () => window.__chamberProbe?.targetLift ?? 0;
    const before = read();
    const cancel = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cancel"),
    );
    cancel?.click();
    const start = performance.now();
    const samples: Array<{ at: number; lift: number }> = [];
    while (performance.now() - start < 4000) {
      await new Promise(requestAnimationFrame);
      const lift = read();
      samples.push({ at: performance.now() - start, lift });
      if (lift < 0.001) break;
    }
    return { before, samples };
  });
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "idle");

  const last = samples.at(-1)!;
  expect(last.lift, "the book comes to rest").toBeLessThan(0.001);
  expect(last.at, "within a few seconds").toBeLessThan(4000);

  // A glide, not a snap: some frame shows the book part-way down. Only software
  // rendering slower than the 0.6 s glide itself could skip every such frame.
  const partWay = samples.some((s) => s.lift > 0.001 && s.lift < before * 0.97);
  const settledFrame = samples.findIndex((s) => s.lift < 0.001);
  const gap = settledFrame > 0 ? last.at - samples[settledFrame - 1]!.at : last.at;
  expect(partWay || gap > 500, JSON.stringify({ before, samples })).toBe(true);
});
