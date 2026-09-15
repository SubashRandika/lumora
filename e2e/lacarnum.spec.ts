import { expect, test, type Page } from "@playwright/test";

/*
 * Lacarnum Inflamari end to end. The scene has no DOM, so these tests read how
 * burnt the cloak is from `window.__chamberProbe.outcomeAmount` (0 whole, 1
 * burnt away at the hem), which the chamber fills in only when a test defines it.
 */

test.describe.configure({ timeout: 120_000 });

const chamber = (page: Page) => page.locator("section[data-chamber-state]");
const amount = (page: Page) =>
  page.evaluate(() => window.__chamberProbe?.outcomeAmount ?? Number.NaN);

async function openLacarnum(page: Page) {
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
  await page.goto("/spells/lacarnum-inflamari/cast");
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

test("the flames burn the cloak and it stays charred", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openLacarnum(page);
  expect(await amount(page)).toBe(0);

  await page.getByRole("button", { name: "Cast Lacarnum Inflamari" }).click();
  await waitForAmount(page, 0.97);
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "effect");

  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page), "burnt after the spell").toBeGreaterThan(0.99);
  await page.waitForTimeout(1500);
  expect(await amount(page), "still burnt a while later").toBeGreaterThan(0.99);
  expect(errors).toEqual([]);
});

test("cast again restores the cloak, then burns it from the beginning", async ({
  page,
}) => {
  await openLacarnum(page);
  await page.getByRole("button", { name: "Cast Lacarnum Inflamari" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0.99);

  // Record every frame from the click until it has burnt again.
  const samples = await page.evaluate(async () => {
    const read = () => window.__chamberProbe?.outcomeAmount ?? 0;
    const again = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cast again"),
    );
    again?.click();
    const start = performance.now();
    const samples: number[] = [];
    let whole = false;
    while (performance.now() - start < 30_000) {
      await new Promise(requestAnimationFrame);
      const value = read();
      samples.push(value);
      if (value < 0.001) whole = true;
      if (whole && value > 0.97) break;
    }
    return samples;
  });

  expect(
    samples.findIndex((value) => value < 0.001),
    "it is restored first",
  ).toBeGreaterThanOrEqual(0);
  expect(samples.at(-1)!, "then it burns again").toBeGreaterThan(0.97);
});

test("switching spells and coming back starts whole", async ({ page }) => {
  await openLacarnum(page);
  await page.getByRole("button", { name: "Cast Lacarnum Inflamari" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await amount(page)).toBeGreaterThan(0.99);

  await spellButton(page, /Oculus Reparo/).click();
  await expect(page).toHaveURL("/spells/oculus-reparo/cast");
  await spellButton(page, /Lacarnum Inflamari/).click();
  await expect(page).toHaveURL("/spells/lacarnum-inflamari/cast");
  await page.waitForFunction(() => window.__chamberProbe?.outcomeAmount === 0, null, {
    timeout: 10_000,
  });
  await expect(
    page.getByRole("button", { name: "Cast Lacarnum Inflamari" }),
  ).toBeVisible();
});

test("cancelling mid-burn restores the cloak smoothly", async ({ page }) => {
  await openLacarnum(page);
  await page.getByRole("button", { name: "Cast Lacarnum Inflamari" }).click();
  await waitForAmount(page, 0.4);

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
  expect(last.amount, "restored").toBeLessThan(0.001);
  expect(last.at, "within a few seconds").toBeLessThan(4000);

  // An ease, not a snap: some frame shows it part-way back. Software rendering
  // under load can draw so few frames that none lands inside the 0.8 s return;
  // only then (a frame gap over half the return) is there nothing to check.
  const partWay = samples.some((s) => s.amount > 0.001 && s.amount < before * 0.97);
  const times = [0, ...samples.map((s) => s.at)];
  const slowestFrame = Math.max(...times.slice(1).map((at, i) => at - times[i]!));
  expect(partWay || slowestFrame > 400, JSON.stringify({ before, samples })).toBe(true);
});
