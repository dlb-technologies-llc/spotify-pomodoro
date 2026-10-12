/**
 * Touch controls, resuming after reload, tab title, notifications, and
 * screen wake lock.
 *
 * @module
 */
import { devices, expect, type Page, test } from "@playwright/test";

const badge = (page: Page, name: string) =>
	page.locator("main").getByText(name, { exact: true });

const { defaultBrowserType: _, ...phone } = devices["Pixel 7"];

test.describe("touch", () => {
	test.use(phone);

	test("runs a full cycle by tapping", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeHidden();
		await page.getByRole("button", { name: "start" }).tap();
		await expect(badge(page, "focus")).toBeVisible();
		await page.getByRole("button", { name: "take a break" }).tap();
		await expect(badge(page, "break")).toBeVisible();
		await page.getByRole("button", { name: "back to focus" }).tap();
		await expect(badge(page, "focus")).toBeVisible();
		await page.getByRole("button", { name: "end" }).tap();
		await expect(page.getByRole("button", { name: "start" })).toBeVisible();
	});
});

test.describe("desktop", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("resumes the countdown after a reload", async ({ page }) => {
		await page.keyboard.press("Space");
		await expect(page.locator(".timer-display")).toContainText("24", {
			timeout: 5_000,
		});
		await page.reload();
		await expect(badge(page, "focus")).toBeVisible();
		await expect(page.locator(".timer-display")).toContainText("24");
		await page.keyboard.press("e");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("shows the countdown in the tab title", async ({ page }) => {
		await expect(page).toHaveTitle("Spotify Pomodoro");
		await page.keyboard.press("Space");
		await expect(page).toHaveTitle(/^🍅 2[45]:\d\d · focus$/);
		await page.keyboard.press("b");
		await expect(page).toHaveTitle(/^☕ 0[45]:\d\d · break$/);
		await page.keyboard.press("e");
		await expect(page).toHaveTitle("Spotify Pomodoro");
	});

	test("Space on a focused button presses the button, not start", async ({
		page,
	}) => {
		const toggle = page.getByRole("button", { name: "toggle theme" });
		const html = page.locator("html");
		const wasDark = await html.evaluate((el) => el.classList.contains("dark"));
		await toggle.focus();
		await page.keyboard.press("Space");
		await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/);
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("letter shortcuts still work after clicking a button", async ({
		page,
	}) => {
		await page.getByRole("button", { name: "start" }).click();
		await expect(badge(page, "focus")).toBeVisible();
		await page.keyboard.press("b");
		await expect(badge(page, "break")).toBeVisible();
	});
});

test.describe("background alerts", () => {
	test("notifies when focus ends and holds a wake lock while running", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["notifications"]);
		await page.clock.install();
		await page.addInitScript(() => {
			const log: Array<string> = [];
			Object.assign(window, { __alerts: log });
			class FakeNotification {
				static permission = "granted";
				static requestPermission = async () => "granted";
				constructor(title: string) {
					log.push(`notify:${title}`);
				}
				addEventListener() {}
				close() {}
			}
			Object.assign(window, { Notification: FakeNotification });
			Document.prototype.hasFocus = () => false;
			Object.defineProperty(navigator, "wakeLock", {
				value: {
					request: async () => {
						log.push("wake:acquire");
						const sentinel = {
							released: false,
							release: async () => {
								sentinel.released = true;
								log.push("wake:release");
							},
						};
						return sentinel;
					},
				},
			});
		});
		await page.goto("/");
		await page.getByRole("button", { name: "Short" }).click();
		await page.getByRole("button", { name: "start" }).click();
		await expect(badge(page, "focus")).toBeVisible();
		await page.clock.fastForward("15:01");
		await expect(page.locator(".timer-display")).toContainText("+");
		await page.getByRole("button", { name: "end" }).click();
		await expect(page.getByRole("button", { name: "start" })).toBeVisible();
		const alerts = await page.evaluate(() => Reflect.get(window, "__alerts"));
		expect(alerts).toEqual([
			"wake:acquire",
			"notify:Focus complete",
			"wake:release",
		]);
	});
});
