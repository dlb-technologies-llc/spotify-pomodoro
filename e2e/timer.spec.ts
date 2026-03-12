import { expect, test } from "@playwright/test";

test.describe("Timer", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("displays idle state with default time", async ({ page }) => {
		const timerDisplay = page.locator(".timer-display");
		await expect(timerDisplay).toContainText("25");
		await expect(timerDisplay).toContainText("00");
		await expect(page.getByText("focus")).not.toBeVisible();
		await expect(page.getByText("break")).not.toBeVisible();
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("starts focus on Space", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();
		await expect(
			page.getByText("press b to start break", { exact: false }),
		).toBeVisible();
	});

	test("starts focus on Enter", async ({ page }) => {
		await page.keyboard.press("Enter");
		await expect(page.getByText("focus")).toBeVisible();
	});

	test("B skips to break during focus", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();
		await expect(
			page.getByText("press f to start focus", { exact: false }),
		).toBeVisible();
	});

	test("F skips to focus during break", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();

		await page.keyboard.press("f");
		await expect(page.getByText("focus")).toBeVisible();
	});

	test("E stops timer and returns to idle", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("e");
		await expect(page.getByText("press space to start")).toBeVisible();
		await expect(page.getByText("focus")).not.toBeVisible();
	});

	test("E stops timer from break phase", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();

		await page.keyboard.press("e");
		await expect(page.getByText("press space to start")).toBeVisible();
		await expect(page.getByText("break")).not.toBeVisible();
	});

	test("Space does nothing when timer is already running", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();
		await expect(
			page.getByText("press b to start break", { exact: false }),
		).toBeVisible();
	});

	test("preset selector changes timer duration", async ({ page }) => {
		const timerDisplay = page.locator(".timer-display");
		await expect(timerDisplay).toContainText("25");

		await page.getByRole("button", { name: "Short" }).click();
		await expect(timerDisplay).toContainText("15");

		await page.getByRole("button", { name: "Long" }).click();
		await expect(timerDisplay).toContainText("50");

		await page.getByRole("button", { name: "Classic" }).click();
		await expect(timerDisplay).toContainText("25");
	});

	test("phase transitions update display labels", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();

		await page.keyboard.press("f");
		await expect(page.getByText("focus")).toBeVisible();
	});

	test("B and F are ignored in wrong phases", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("f");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();
	});

	test("break phase shows correct duration after preset change", async ({
		page,
	}) => {
		const timerDisplay = page.locator(".timer-display");
		await page.getByRole("button", { name: "Short" }).click();
		await expect(timerDisplay).toContainText("15");

		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();

		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();
		await expect(timerDisplay).toContainText("03");
	});

	test("keybinds are ignored when input is focused", async ({ page }) => {
		const input = page.locator("input").first();
		const hasInput = (await input.count()) > 0;

		if (hasInput) {
			await input.focus();
			await page.keyboard.press("Space");
			await expect(page.getByText("press space to start")).toBeVisible();
		}
	});
});
