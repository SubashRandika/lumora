import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) =>
  page
    .getByRole("list")
    .filter({ has: page.getByRole("article") })
    .getByRole("article");

test.describe("spell library", () => {
  test("search narrows the list and updates the URL", async ({ page }) => {
    await page.goto("/spells");
    await expect(cards(page)).toHaveCount(7);

    await page.getByRole("searchbox", { name: "Search spells" }).fill("levi");
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Wingardium Leviosa" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Showing 1 of 7 spells");
    await expect(page).toHaveURL("/spells?q=levi");
  });

  test("filters combine and can be cleared", async ({ page }) => {
    await page.goto("/spells");
    // Click the visible chip (the <label>); the checkbox inside is visually hidden.
    await page.getByRole("group", { name: "Category" }).getByText("Charms").click();
    await page
      .getByRole("group", { name: "Difficulty" })
      .getByText("Intermediate")
      .click();

    await expect(cards(page)).toHaveCount(2);
    await expect(page).toHaveURL("/spells?category=charms&difficulty=intermediate");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(cards(page)).toHaveCount(7);
    await expect(page).toHaveURL("/spells");
  });

  test("a shared filtered link opens with the same results", async ({ page }) => {
    await page.goto("/spells?medium=book&category=curses");
    await expect(cards(page)).toHaveCount(2);
    await expect(
      page
        .getByRole("group", { name: "Appears in" })
        .getByRole("checkbox", { name: "Book" }),
    ).toBeChecked();
  });

  test("shows a way out when nothing matches", async ({ page }) => {
    await page.goto("/spells?q=avada");
    await expect(page.getByText("No spells match")).toBeVisible();
    await expect(page.getByText("Nothing matches “avada”.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).last().click();
    await expect(cards(page)).toHaveCount(7);
  });

  test("filters work from the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard navigation is a desktop interaction");
    await page.goto("/spells");
    const film = page
      .getByRole("group", { name: "Appears in" })
      .getByRole("checkbox", { name: "Film" });
    await film.focus();
    await page.keyboard.press("Space");
    await expect(film).toBeChecked();
    await expect(cards(page)).toHaveCount(6);
  });
});

test.describe("spell detail", () => {
  test("shows the wand motion and links to neighbouring spells", async ({ page }) => {
    await page.goto("/spells/wingardium-leviosa");
    await expect(
      page.getByRole("img", { name: /Wand motion: Swish in a smooth arc/ }),
    ).toBeVisible();

    const more = page.getByRole("navigation", { name: "More spells" });
    await expect(more.getByRole("link", { name: /Previous spell/ })).toHaveCount(0);
    await more.getByRole("link", { name: /Next spell/ }).click();
    await expect(page).toHaveURL("/spells/alohomora");
  });

  test("includes structured data and a share image", async ({ page, request }) => {
    await page.goto("/spells/lumos-solem");
    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    );
    expect(jsonLd).toMatchObject({ "@type": "DefinedTerm", name: "Lumos Solem" });

    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");
    expect(ogImage).toBeTruthy();
    const response = await request.get(new URL(ogImage!).pathname);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });
});

test("books index lists the works", async ({ page }) => {
  await page.goto("/books");
  await page.getByRole("link", { name: /Philosopher’s Stone/ }).click();
  await expect(page).toHaveURL("/books/philosophers-stone");
});
