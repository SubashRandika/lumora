import { expect, test, type Page } from "@playwright/test";

/*
 * Locomotor Mortis end to end. The scene has no DOM, so these tests read how
 * tightly the practice dummy's legs are bound from
 * `window.__chamberProbe.outcomeAmount` (0 at rest, 1 fully bound), which the
 * chamber fills in only when a test defines it.
 */

test.describe.configure({ timeout: 120_000 });

const chamber = (page: Page) => page.locator("section[data-chamber-state]");
const amount = (page: Page) =>
  page.evaluate(() => window.__chamberProbe?.outcomeAmount ?? Number.NaN);

async function openLocomotor(page: Page) {
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
  await page.goto("/spells/locomotor-mortis/cast");
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

test("bands bind the dummy' legs, it hops, and it stays bound", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openLocomotor(page);
  expect(await amount(page)).toBe(0);

  await page.getByRole("button", { name: "Cast Locomotor Mortis" }).click();
  await waitForAmount(page, 0.97);
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect");

  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page), "bound after the spell").toBeGreaterThan(0.99);
  await page.waitForTimeout(1500);
  expect(await amount(page), "still bound a while later").toBeGreaterThan(0.99);
  expect(errors).toEqual([]);
});

test("cast again releases the bands, then binds the legs from the beginning", async ({
  page,
}) => {
  await openLocomotor(page);
  await page.getByRole("button", { name: "Cast Locomotor Mortis" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0.99);

  // Record every frame from the click until it is bound again.
  const samples = await page.evaluate(async () => {
    const read = () => window.__chamberProbe?.outcomeAmount ?? 0;
    const again = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cast again"),
    );
    again?.click();
    const start = performance.now();
    const samples: number[] = [];
    let released = false;
    while (performance.now() - start < 30_000) {
      await new Promise(requestAnimationFrame);
      const value = read();
      samples.push(value);
      if (value < 0.001) released = true;
      if (released && value > 0.97) break;
    }
    return samples;
  });

  expect(
    samples.findIndex((value) => value < 0.001),
    "the bands release first",
  ).toBeGreaterThanOrEqual(0);
  expect(samples.at(-1)!, "then they bind again").toBeGreaterThan(0.97);
});

test("switching spells and coming back starts unbound", async ({ page }) => {
  await openLocomotor(page);
  await page.getByRole("button", { name: "Cast Locomotor Mortis" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0.99);

  await spellButton(page, /Alohomora/).click();
  await expect(page).toHaveURL("/spells/alohomora/cast");
  await spellButton(page, /Locomotor Mortis/).click();
  await expect(page).toHaveURL("/spells/locomotor-mortis/cast");
  await page.waitForFunction(() => window.__chamberProbe?.outcomeAmount === 0, null, {
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "Cast Locomotor Mortis" })).toBeVisible();
});

test("cancelling mid-bind releases the bands smoothly", async ({ page }) => {
  await openLocomotor(page);
  await page.getByRole("button", { name: "Cast Locomotor Mortis" }).click();
  await waitForAmount(page, 0.6);

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
  expect(last.amount, "the bands release").toBeLessThan(0.001);
  expect(last.at, "within a few seconds").toBeLessThan(4000);

  // An ease, not a snap: some frame shows it part-way back. Software rendering
  // under load can draw so few frames that none lands inside the 0.8 s release;
  // only then (a frame gap over half the release) is there nothing to check.
  const partWay = samples.some((s) => s.amount > 0.001 && s.amount < before * 0.97);
  const times = [0, ...samples.map((s) => s.at)];
  const slowestFrame = Math.max(...times.slice(1).map((at, i) => at - times[i]!));
  expect(partWay || slowestFrame > 400, JSON.stringify({ before, samples })).toBe(true);
});
