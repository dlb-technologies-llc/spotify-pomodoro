/**
 * Timer transitions record pomodoros and sessions through the API.
 *
 * @module
 */
import { expect, type Page, type Response, test } from "@playwright/test";

const api = (page: Page, method: string, pattern: RegExp, status: number) =>
	page.waitForResponse(
		(r: Response) =>
			r.request().method() === method &&
			pattern.test(new URL(r.url()).pathname) &&
			r.status() === status,
	);

const stats = async (page: Page) => {
	const response = await page.request.get(
		`/api/stats?tz=${encodeURIComponent("America/New_York")}`,
	);
	expect(response.ok()).toBe(true);
	return response.json();
};

test.describe("Session persistence", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("a full pomodoro cycle is recorded", async ({ page }) => {
		const before = await stats(page);

		const created = api(page, "POST", /^\/api\/pomodoros$/, 201);
		const focusStarted = api(page, "POST", /^\/api\/focus-sessions$/, 201);
		await page.keyboard.press("Space");
		await expect(page.getByText("focus", { exact: true })).toBeVisible();
		await Promise.all([created, focusStarted]);

		const focusDone = api(
			page,
			"POST",
			/^\/api\/focus-sessions\/[^/]+\/complete$/,
			200,
		);
		const breakStarted = api(page, "POST", /^\/api\/break-sessions$/, 201);
		await page.keyboard.press("b");
		await expect(page.getByText("break", { exact: true })).toBeVisible();
		await Promise.all([focusDone, breakStarted]);

		const breakDone = api(
			page,
			"POST",
			/^\/api\/break-sessions\/[^/]+\/complete$/,
			200,
		);
		const pomodoroDone = api(
			page,
			"POST",
			/^\/api\/pomodoros\/[^/]+\/complete$/,
			200,
		);
		await page.keyboard.press("e");
		await expect(page.getByText("press space to start")).toBeVisible();
		await Promise.all([breakDone, pomodoroDone]);

		const after = await stats(page);
		expect(after.totalPomodoros).toBe(before.totalPomodoros + 1);
		expect(after.completedPomodoros).toBe(before.completedPomodoros + 1);
		expect(after.completedFocusSessions).toBe(
			before.completedFocusSessions + 1,
		);
		expect(after.completedBreakSessions).toBe(
			before.completedBreakSessions + 1,
		);
	});

	test("the stats dialog shows recorded pomodoros", async ({ page }) => {
		const pomodoroDone = api(
			page,
			"POST",
			/^\/api\/pomodoros\/[^/]+\/complete$/,
			200,
		);
		await page.keyboard.press("Space");
		await expect(page.getByText("focus", { exact: true })).toBeVisible();
		await page.keyboard.press("e");
		await pomodoroDone;

		const { completedPomodoros } = await stats(page);
		await page.getByRole("button", { name: "statistics" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByText("Statistics")).toBeVisible();
		await expect(
			dialog.getByText(`${completedPomodoros} total pomodoros completed`),
		).toBeVisible();
		await dialog.getByRole("button", { name: "Week", exact: true }).click();
		await expect(
			dialog.getByText("Pomodoros", { exact: true }).first(),
		).toBeVisible();
	});
});

test.describe("Theme", () => {
	test("toggle persists across reloads", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/");
		const html = page.locator("html");
		await expect(html).not.toHaveClass(/dark/);
		await page.getByRole("button", { name: "toggle theme" }).click();
		await expect(html).toHaveClass(/dark/);
		await page.reload();
		await expect(html).toHaveClass(/dark/);
	});
});
