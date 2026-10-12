/**
 * Settings, long breaks, daily goal, and labels.
 *
 * @module
 */
import { expect, type Page, test } from "@playwright/test";

const badge = (page: Page, name: string) =>
	page.locator("main").getByText(name, { exact: true });

const openSettings = async (page: Page) => {
	await page.getByRole("button", { name: "settings" }).click();
	return page.getByRole("dialog");
};

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("press space to start")).toBeVisible();
});

test("custom durations persist and mark the preset as custom", async ({
	page,
}) => {
	const dialog = await openSettings(page);
	await dialog.getByLabel("Focus", { exact: true }).fill("42");
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(page.locator(".timer-display")).toContainText("42");
	await expect(page.getByText("Custom", { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.locator(".timer-display")).toContainText("42");
	await page.getByRole("button", { name: "Classic" }).click();
	await expect(page.locator(".timer-display")).toContainText("25");
	await expect(page.getByText("Custom", { exact: true })).toBeHidden();
});

test("invalid settings cannot be saved", async ({ page }) => {
	const dialog = await openSettings(page);
	await dialog.getByLabel("Focus", { exact: true }).fill("0");
	await expect(dialog.getByRole("alert")).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("a long break follows every N focus sessions", async ({ page }) => {
	const dialog = await openSettings(page);
	await dialog.getByLabel("Long break every").fill("2");
	await dialog.getByRole("button", { name: "Save" }).click();
	await page.getByRole("button", { name: "start" }).click();
	await page.keyboard.press("b");
	await expect(badge(page, "break")).toBeVisible();
	await page.keyboard.press("f");
	await expect(
		page.getByRole("button", { name: "take a long break" }),
	).toBeVisible();
	await page.keyboard.press("b");
	await expect(badge(page, "long break")).toBeVisible();
	await expect(page.locator(".timer-display")).toContainText("15");
	await expect(page).toHaveTitle(/· long break$/);
});

test("auto-start begins the break when focus reaches zero", async ({
	page,
}) => {
	await page.clock.install();
	await page.reload();
	const dialog = await openSettings(page);
	await dialog.getByLabel("Focus", { exact: true }).fill("1");
	await dialog.getByLabel("Start breaks automatically").check();
	await dialog.getByRole("button", { name: "Save" }).click();
	await page.getByRole("button", { name: "start" }).click();
	await page.clock.fastForward("01:01");
	await expect(badge(page, "break")).toBeVisible();
	await expect(page.locator(".timer-display")).not.toContainText("+");
});

test("the daily goal counts completed pomodoros", async ({ page }) => {
	const progress = page.getByText(/\d+ \/ 8 today|goal reached/);
	await expect(progress).toBeVisible();
	const before = Number((await progress.textContent())?.match(/\d+/)?.[0] ?? 0);
	await page.getByRole("button", { name: "start" }).click();
	await page.keyboard.press("e");
	await expect(
		page.getByText(new RegExp(`^${before + 1} / 8 today$|goal reached`)),
	).toBeVisible();
});

test("the label is saved with the pomodoro and survives reloads", async ({
	page,
}) => {
	const label = page.getByLabel("pomodoro label");
	await label.fill("write the report");
	await label.press("Enter");
	const created = page.waitForResponse(
		(r) => r.url().includes("/api/pomodoros?label=write") && r.status() === 201,
	);
	await page.getByRole("button", { name: "start" }).click();
	expect((await (await created).json()).label).toBe("write the report");
	await page.reload();
	await expect(page.getByLabel("pomodoro label")).toHaveValue(
		"write the report",
	);
	await page.keyboard.press("e");
});
