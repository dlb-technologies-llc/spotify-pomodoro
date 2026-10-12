/**
 * Visual regression snapshots of the main screens.
 *
 * Baselines are rendered in the Playwright Docker image so they match CI;
 * update them with `bun run test:visual:update`.
 *
 * @module
 */
import { expect, type Page, test } from "@playwright/test";

const settle = async (page: Page) => {
	await page.evaluate(() => document.fonts.ready);
	await page.mouse.move(0, 0);
};

test.describe("signed out", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("login", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
		await settle(page);
		await expect(page).toHaveScreenshot("login.png");
	});
});

test.describe("signed in", () => {
	test("home, light", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
		await settle(page);
		await expect(page).toHaveScreenshot("home-light.png");
	});

	test("home, dark", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "dark" });
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
		await settle(page);
		await expect(page).toHaveScreenshot("home-dark.png");
	});

	test("settings", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/");
		await page.getByRole("button", { name: "settings" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await settle(page);
		await expect(page).toHaveScreenshot("settings.png");
	});

	test("home on a phone", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ colorScheme: "dark" });
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
		await settle(page);
		await expect(page).toHaveScreenshot("home-phone.png", { fullPage: true });
	});
});
