/**
 * Automated accessibility checks (axe, WCAG 2.1 A/AA) in both themes.
 *
 * @module
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const COLOR_SCHEMES: ReadonlyArray<"light" | "dark"> = ["light", "dark"];

const audit = async (page: Page, label: string) => {
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	const summary = results.violations.map(
		(v) =>
			`${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
	);
	expect(summary).toEqual([]);
};

for (const scheme of COLOR_SCHEMES) {
	test.describe(`${scheme} theme`, () => {
		test.use({ colorScheme: scheme });

		test("main screen, idle and running", async ({ page }) => {
			await page.goto("/");
			await expect(page.getByText("press space to start")).toBeVisible();
			await audit(page, "idle");
			await page.getByRole("button", { name: "start" }).click();
			await expect(
				page.locator("main").getByText("focus", { exact: true }),
			).toBeVisible();
			await audit(page, "running");
			await page.keyboard.press("e");
		});

		test("settings and statistics dialogs", async ({ page }) => {
			await page.goto("/");
			await page.getByRole("button", { name: "settings" }).click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await audit(page, "settings");
			await page.keyboard.press("Escape");
			await page.getByRole("button", { name: "statistics" }).click();
			const dialog = page.getByRole("dialog");
			await expect(dialog.getByText("Focus per day")).toBeVisible();
			await audit(page, "stats overview");
			await dialog.getByRole("tab", { name: "history" }).click();
			await audit(page, "stats history");
			await dialog.getByRole("tab", { name: "data" }).click();
			await audit(page, "stats data");
		});

		test("first-run walkthrough", async ({ page }) => {
			await page.addInitScript(() =>
				localStorage.removeItem("pomodoro_onboarded"),
			);
			await page.goto("/");
			await expect(page.getByRole("dialog")).toContainText(
				"Welcome to Spotify Pomodoro",
			);
			await audit(page, "onboarding");
		});
	});
}

test("text colors meet WCAG AA contrast in both themes", async ({ page }) => {
	await page.goto("/");
	const ratios = await page.evaluate(() => {
		const parse = (value: string) => {
			const hex = value.trim().replace("#", "");
			return [0, 2, 4].map(
				(i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
			);
		};
		const luminance = (rgb: Array<number>) => {
			const [r = 0, g = 0, b = 0] = rgb.map((v) =>
				v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
			);
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const contrast = (a: Array<number>, b: Array<number>) => {
			const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
			return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
		};
		const mix = (fg: Array<number>, bg: Array<number>, alpha: number) =>
			fg.map((v, i) => v * alpha + (bg[i] ?? 0) * (1 - alpha));
		const results: Record<string, number> = {};
		for (const theme of ["light", "dark"]) {
			document.documentElement.classList.toggle("dark", theme === "dark");
			const css = getComputedStyle(document.documentElement);
			const token = (name: string) => parse(css.getPropertyValue(name));
			const bg = token("--background");
			results[`${theme} muted/90`] = contrast(
				mix(token("--muted-foreground"), bg, 0.9),
				bg,
			);
			for (const name of [
				"--foreground",
				"--primary",
				"--lofi-focus",
				"--lofi-break",
				"--lofi-overtime",
				"--destructive",
				"--spotify-text",
			]) {
				results[`${theme} ${name}`] = contrast(token(name), bg);
			}
		}
		return results;
	});
	const failing = Object.entries(ratios).filter(([, ratio]) => ratio < 4.5);
	expect(failing).toEqual([]);
});
