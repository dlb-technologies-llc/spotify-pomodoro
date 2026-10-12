/**
 * Security headers and the Content-Security-Policy, checked against the
 * running server and the app's main flows.
 *
 * @module
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const recordViolations = async (page: Page) => {
	const violations: Array<string> = [];
	page.on("console", (message) => {
		if (/Content.Security.Policy/i.test(message.text())) {
			violations.push(message.text());
		}
	});
	await page.exposeFunction("reportViolation", (text: string) => {
		violations.push(text);
	});
	await page.addInitScript(() => {
		document.addEventListener("securitypolicyviolation", (event) => {
			const report = Reflect.get(window, "reportViolation");
			if (typeof report === "function") {
				report(`${event.violatedDirective} ${event.blockedURI}`);
			}
		});
	});
	return violations;
};

test("pages and API responses carry the security headers", async ({
	request,
}) => {
	for (const path of ["/", "/login", "/api/health", "/api/stats"]) {
		const response = await request.get(path, { maxRedirects: 0 });
		const headers = response.headers();
		expect(headers["x-frame-options"], path).toBe("DENY");
		expect(headers["x-content-type-options"], path).toBe("nosniff");
		expect(headers["x-robots-tag"], path).toBe("noindex, nofollow");
		expect(headers["referrer-policy"], path).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(headers["permissions-policy"], path).toContain("camera=()");
		expect(headers["content-security-policy"], path).toContain(
			"frame-ancestors 'none'",
		);
		expect(headers["strict-transport-security"], path).toBeUndefined();
	}
	const page = await request.get("/login");
	const csp = page.headers()["content-security-policy"] ?? "";
	expect(csp).toMatch(/script-src [^;]*'self'[^;]*https:\/\/sdk\.scdn\.co/);
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("style-src 'self' 'unsafe-inline'");
	expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
});

test("the app is never indexed", async ({ page, request }) => {
	const robots = await request.get("/robots.txt");
	expect(await robots.text()).toContain("Disallow: /");
	for (const path of ["/", "/login"]) {
		await page.goto(path);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
			"content",
			"noindex, nofollow",
		);
	}
});

test("HSTS is sent behind an HTTPS proxy", async ({ request }) => {
	const response = await request.get("/api/health", {
		headers: { "x-forwarded-proto": "https" },
	});
	expect(response.headers()["strict-transport-security"]).toContain(
		"max-age=31536000",
	);
});

test("the readiness probe checks the database", async ({ request }) => {
	const response = await request.get("/api/ready");
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ status: "ok" });
});

test("the main flows run without CSP violations", async ({
	connected: { page },
}) => {
	const violations = await recordViolations(page);
	await page.reload();
	const playlist = page.getByRole("button", { name: "playlist" });
	await expect(playlist).toBeVisible();

	await playlist.click();
	await expect(page.getByText("Lofi Beats")).toBeVisible();
	await page.keyboard.press("Escape");

	await page.getByRole("button", { name: "start" }).click();
	await expect(
		page.locator("main").getByText("focus", { exact: true }),
	).toBeVisible();
	await page.keyboard.press("e");

	await page.getByRole("button", { name: "settings" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.keyboard.press("Escape");

	await page.getByRole("button", { name: "statistics" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Focus per day")).toBeVisible();
	await dialog.getByRole("tab", { name: "history" }).click();
	await dialog.getByRole("tab", { name: "data" }).click();
	await dialog.getByRole("button", { name: "Back up now" }).click();
	await expect(dialog.getByText(/^Saved pomodoro-/)).toBeVisible();
	await expect(dialog.getByText(/^Last backup /)).toBeVisible();

	expect(violations).toEqual([]);
});
