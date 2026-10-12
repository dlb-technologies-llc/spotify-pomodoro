/**
 * Stats overview, history, export, and import.
 *
 * @module
 */
import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const recordPomodoro = async (page: Page, label: string) => {
	const input = page.getByLabel("pomodoro label");
	await input.fill(label);
	await input.press("Enter");
	const completed = page.waitForResponse(
		(r) =>
			/\/api\/pomodoros\/[^/]+\/complete$/.test(new URL(r.url()).pathname) &&
			r.ok(),
	);
	await page.getByRole("button", { name: "start" }).click();
	await page.keyboard.press("e");
	await completed;
};

const openStats = async (page: Page, tab: string) => {
	await page.getByRole("button", { name: "statistics" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("tab", { name: tab }).click();
	return dialog;
};

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("press space to start")).toBeVisible();
});

test("overview shows the week, focus charts, and overtime", async ({
	page,
}) => {
	await recordPomodoro(page, "overview check");
	const dialog = await openStats(page, "overview");
	await expect(dialog.getByRole("region", { name: "this week" })).toContainText(
		"Focus this week",
	);
	await expect(dialog.getByText("Focus per day")).toBeVisible();
	await dialog.getByRole("button", { name: "Weeks" }).click();
	await expect(dialog.getByText("Focus per week")).toBeVisible();
	await expect(dialog.getByText("When you focus")).toBeVisible();
	await expect(dialog.getByRole("region", { name: "overtime" })).toContainText(
		"Avg focus overtime",
	);
});

test("history lists, relabels, and deletes pomodoros", async ({ page }) => {
	const label = `history ${Date.now()}`;
	await recordPomodoro(page, label);
	const dialog = await openStats(page, "history");
	const items = dialog.getByRole("listitem");
	await expect(items.first()).toBeVisible();
	const index = await items.evaluateAll(
		(elements, wanted) =>
			elements.findIndex((li) => li.querySelector("input")?.value === wanted),
		label,
	);
	expect(index).toBeGreaterThanOrEqual(0);
	const row = items.nth(index);

	const renamed = `${label} renamed`;
	const relabeled = page.waitForResponse(
		(r) => r.request().method() === "PATCH" && r.ok(),
	);
	await row.getByRole("textbox").fill(renamed);
	await row.getByRole("textbox").press("Enter");
	await relabeled;

	const deleted = page.waitForResponse(
		(r) => r.request().method() === "DELETE" && r.status() === 204,
	);
	await row.getByRole("button", { name: /delete pomodoro/ }).click();
	await row.getByRole("button", { name: "confirm delete" }).click();
	await deleted;
	await expect(dialog.locator(`input[value="${renamed}"]`)).toHaveCount(0);
});

test("exports JSON and CSV and imports the JSON back", async ({ page }) => {
	const label = `export ${Date.now()}`;
	await recordPomodoro(page, label);
	const dialog = await openStats(page, "data");

	const csvDownload = page.waitForEvent("download");
	await dialog.getByRole("link", { name: "CSV" }).click();
	const csv = await readFile((await (await csvDownload).path()) ?? "", "utf8");
	expect(csv.split("\n")[0]).toBe(
		"pomodoro_id,label,created_at,completed_at,focus_seconds,focus_overtime_seconds,break_seconds,break_overtime_seconds",
	);
	expect(csv).toContain(label);

	const jsonDownload = page.waitForEvent("download");
	await dialog.getByRole("link", { name: "JSON" }).click();
	const download = await jsonDownload;
	expect(download.suggestedFilename()).toMatch(
		/^spotify-pomodoro-\d{4}-\d{2}-\d{2}\.json$/,
	);
	const exportPath = (await download.path()) ?? "";
	const exported = JSON.parse(await readFile(exportPath, "utf8"));
	const mine = exported.pomodoros.find(
		(p: { label: string | null }) => p.label === label,
	);
	expect(mine).toBeTruthy();

	await page.request.delete(`/api/pomodoros/${mine.id}`);
	await dialog.getByLabel("import JSON export").setInputFiles(exportPath);
	await expect(dialog.getByText(/Imported 1 pomodoros/)).toBeVisible();

	await dialog.getByLabel("import JSON export").setInputFiles({
		name: "bad.json",
		mimeType: "application/json",
		buffer: Buffer.from('{"nope":true}'),
	});
	await expect(
		dialog.getByText("That file isn't a Spotify Pomodoro JSON export."),
	).toBeVisible();
});
