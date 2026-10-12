/**
 * Theme, walkthrough, toasts, popovers, PWA, offline recording,
 * announcements, and responsive layout.
 *
 * @module
 */
import { expect, test } from "./fixtures";

test("theme follows the system until chosen", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	const html = page.locator("html");
	await expect(html).toHaveClass(/dark/);
	await page.emulateMedia({ colorScheme: "light" });
	await expect(html).not.toHaveClass(/dark/);
	await page.getByRole("button", { name: "toggle theme" }).click();
	await expect(html).toHaveClass(/dark/);
	await page.emulateMedia({ colorScheme: "light" });
	await page.reload();
	await expect(html).toHaveClass(/dark/);
});

test("first-run walkthrough shows once", async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.getItem("seen")) {
			localStorage.removeItem("pomodoro_onboarded");
			sessionStorage.setItem("seen", "1");
		}
	});
	await page.goto("/");
	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText("Welcome to Spotify Pomodoro");
	await dialog.getByRole("button", { name: "Next" }).click();
	await expect(dialog).toContainText("Bring your music");
	await dialog.getByRole("button", { name: "Next" }).click();
	await expect(dialog).toContainText("Shortcuts");
	await dialog.getByRole("button", { name: "Get started" }).click();
	await expect(dialog).toBeHidden();
	await page.reload();
	await expect(page.getByText("press space to start")).toBeVisible();
	await expect(page.getByRole("dialog")).toBeHidden();
});

test("saving settings confirms with a toast", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "settings" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Settings saved")).toBeVisible();
});

test("popovers close on Escape and outside clicks", async ({
	connected: { page },
}) => {
	const trigger = page.getByRole("button", { name: "playlist" });
	await trigger.click();
	const search = page.getByRole("searchbox", { name: "search playlists" });
	await expect(search).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(search).toBeHidden();
	await expect(trigger).toBeFocused();
	await trigger.click();
	await expect(search).toBeVisible();
	await page.locator("footer").click();
	await expect(search).toBeHidden();
});

test("announces phase changes to screen readers", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "start" }).click();
	await expect(page.locator('p[aria-live="polite"]')).toHaveText(
		"focus started, 25 minutes",
	);
	await page.keyboard.press("b");
	await expect(page.locator('p[aria-live="polite"]')).toHaveText(
		"break started, 5 minutes",
	);
	await page.keyboard.press("e");
});

test("is installable", async ({ page, request }) => {
	await page.goto("/");
	const href = await page.locator('link[rel="manifest"]').getAttribute("href");
	const manifest = await (await request.get(href ?? "")).json();
	expect(manifest.display).toBe("standalone");
	for (const icon of manifest.icons) {
		expect((await request.get(icon.src)).ok()).toBe(true);
	}
	await expect
		.poll(() =>
			page.evaluate(async () =>
				Boolean(await navigator.serviceWorker.getRegistration()),
			),
		)
		.toBe(true);
});

test("works offline and syncs recordings when back online", async ({
	page,
	context,
}) => {
	await page.goto("/");
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	const before = await (await page.request.get("/api/stats")).json();

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole("button", { name: "start" })).toBeVisible();
	await page.getByRole("button", { name: "start" }).click();
	await page.keyboard.press("e");
	await expect(page.getByText(/changes? waiting to sync/)).toBeVisible();

	await context.setOffline(false);
	await expect(page.getByText(/changes? waiting to sync/)).toBeHidden({
		timeout: 20_000,
	});
	const after = await (await page.request.get("/api/stats")).json();
	expect(after.completedPomodoros).toBe(before.completedPomodoros + 1);
});

for (const width of [375, 768, 1280]) {
	test(`fits a ${width}px wide screen`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/");
		await page.getByRole("button", { name: "start" }).click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		);
		expect(overflow).toBe(false);
		const display = await page.locator(".timer-display").boundingBox();
		const fontSize = await page
			.locator(".timer-display")
			.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
		expect(display?.height ?? 0).toBeLessThan(fontSize * 1.5);
		await page.keyboard.press("e");
	});
}
