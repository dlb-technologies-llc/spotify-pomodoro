/**
 * E2E tests for session persistence through the full pomodoro lifecycle.
 *
 * Verifies that timer phase transitions trigger the correct API calls
 * and that session data persists to the database.
 *
 * @module
 */
import { expect, test } from "@playwright/test";

test.describe("Session Persistence", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("full pomodoro cycle persists to database", async ({ page }) => {
		const apiCalls: { url: string; status: number; method: string }[] = [];

		page.on("response", (response) => {
			const url = response.url();
			if (url.includes("/api/")) {
				apiCalls.push({
					url: new URL(url).pathname,
					status: response.status(),
					method: response.request().method(),
				});
			}
		});

		/** Start focus session (Space) -> POST /api/pomodoros (201) + POST /api/focus-sessions (201) */
		const pomodoroCreated = page.waitForResponse(
			(r) => r.url().includes("/api/pomodoros") && r.status() === 201,
		);
		const focusCreated = page.waitForResponse(
			(r) => r.url().includes("/api/focus-sessions") && r.status() === 201,
		);
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();
		await pomodoroCreated;
		await focusCreated;

		/** Switch to break (B) -> POST /api/focus-sessions/:id/complete (200) + POST /api/break-sessions (201) */
		const focusCompleted = page.waitForResponse(
			(r) =>
				r.url().includes("/api/focus-sessions/") &&
				r.url().includes("/complete") &&
				r.status() === 200,
		);
		const breakCreated = page.waitForResponse(
			(r) => r.url().includes("/api/break-sessions") && r.status() === 201,
		);
		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();
		await focusCompleted;
		await breakCreated;

		/** End session (E) -> POST /api/break-sessions/:id/complete (200) + POST /api/pomodoros/:id/complete (200) */
		const breakCompleted = page.waitForResponse(
			(r) =>
				r.url().includes("/api/break-sessions/") &&
				r.url().includes("/complete") &&
				r.status() === 200,
		);
		const pomodoroCompleted = page.waitForResponse(
			(r) =>
				r.url().includes("/api/pomodoros/") &&
				r.url().includes("/complete") &&
				r.status() === 200,
		);
		await page.keyboard.press("e");
		await expect(page.getByText("press space to start")).toBeVisible();
		await breakCompleted;
		await pomodoroCompleted;

		const pomodoroCreates = apiCalls.filter(
			(c) => c.url === "/api/pomodoros" && c.method === "POST",
		);
		expect(pomodoroCreates.length).toBeGreaterThanOrEqual(1);

		const focusCreates = apiCalls.filter(
			(c) => c.url === "/api/focus-sessions" && c.method === "POST",
		);
		expect(focusCreates.length).toBeGreaterThanOrEqual(1);

		const breakCreates = apiCalls.filter(
			(c) => c.url === "/api/break-sessions" && c.method === "POST",
		);
		expect(breakCreates.length).toBeGreaterThanOrEqual(1);

		const focusCompletes = apiCalls.filter(
			(c) =>
				c.url.startsWith("/api/focus-sessions/") &&
				c.url.endsWith("/complete") &&
				c.method === "POST",
		);
		expect(focusCompletes.length).toBeGreaterThanOrEqual(1);

		const breakCompletes = apiCalls.filter(
			(c) =>
				c.url.startsWith("/api/break-sessions/") &&
				c.url.endsWith("/complete") &&
				c.method === "POST",
		);
		expect(breakCompletes.length).toBeGreaterThanOrEqual(1);

		const pomodoroCompletes = apiCalls.filter(
			(c) =>
				c.url.startsWith("/api/pomodoros/") &&
				c.url.endsWith("/complete") &&
				c.method === "POST",
		);
		expect(pomodoroCompletes.length).toBeGreaterThanOrEqual(1);

		/** Verify stats reflect the persisted data */
		const statsResponse = await page.request.get("/api/stats");
		expect(statsResponse.ok()).toBe(true);
		const stats = await statsResponse.json();
		expect(stats.totalPomodoros).toBeGreaterThanOrEqual(1);
	});

	test("stats reflect completed sessions", async ({ page }) => {
		/** Run a quick pomodoro cycle: focus -> break -> end */
		const focusCreated = page.waitForResponse(
			(r) => r.url().includes("/api/focus-sessions") && r.status() === 201,
		);
		await page.keyboard.press("Space");
		await expect(page.getByText("focus")).toBeVisible();
		await focusCreated;

		const breakCreated = page.waitForResponse(
			(r) => r.url().includes("/api/break-sessions") && r.status() === 201,
		);
		await page.keyboard.press("b");
		await expect(page.getByText("break")).toBeVisible();
		await breakCreated;

		/** Wait for all completion API calls to finish */
		const pomodoroCompleted = page.waitForResponse(
			(r) =>
				r.url().includes("/api/pomodoros/") &&
				r.url().includes("/complete") &&
				r.status() === 200,
		);
		await page.keyboard.press("e");
		await expect(page.getByText("press space to start")).toBeVisible();
		await pomodoroCompleted;

		/** Verify stats endpoint returns valid data */
		const response = await page.request.get("/api/stats");
		expect(response.ok()).toBe(true);
		const stats = await response.json();

		expect(stats.totalPomodoros).toBeGreaterThanOrEqual(1);
		expect(stats.completedPomodoros).toBeGreaterThanOrEqual(1);
		expect(stats.completedFocusSessions).toBeGreaterThanOrEqual(1);
		expect(stats.completedBreakSessions).toBeGreaterThanOrEqual(1);
		expect(stats.totalFocusSeconds).toBeGreaterThanOrEqual(0);
		expect(stats.totalBreakSeconds).toBeGreaterThanOrEqual(0);
	});
});
