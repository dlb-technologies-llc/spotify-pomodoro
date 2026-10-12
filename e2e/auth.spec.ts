import { expect, type Page, test } from "@playwright/test";

const signIn = async (page: Page, password: string) => {
	await page.getByLabel("password").fill(password);
	await page.getByRole("button", { name: "sign in" }).click();
};

test.describe("Authentication", () => {
	test("login page renders", async ({ page }) => {
		await page.goto("/login");
		const username = page.getByLabel("username");
		await expect(username).toHaveValue("admin");
		await expect(username).toHaveAttribute("readonly", "");
		await expect(page.getByLabel("password")).toBeVisible();
	});

	test("protected page redirects to login and back", async ({ page }) => {
		await page.goto("/?from=test");
		await page.waitForURL(/\/login\?return=/);
		await signIn(page, "test-password");
		await page.waitForURL("/?from=test");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("wrong password shows an error", async ({ page }) => {
		await page.goto("/login");
		await signIn(page, "wrong-password");
		await expect(page.getByText("Invalid credentials")).toBeVisible();
		expect(page.url()).toContain("/login");
	});

	test("never redirects off-site after login", async ({ page }) => {
		await page.goto("/login?return=https://example.com");
		await signIn(page, "test-password");
		await page.waitForURL("/");
	});

	test("API rejects requests without a session", async ({ request }) => {
		const response = await request.get("/api/stats");
		expect(response.status()).toBe(401);
		expect((await request.get("/api/health")).status()).toBe(200);
	});

	test("session survives reload and ends on logout", async ({ page }) => {
		await page.goto("/login");
		await signIn(page, "test-password");
		await page.waitForURL("/");
		await page.reload();
		await expect(page.getByText("press space to start")).toBeVisible();
		await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
		await page.goto("/");
		await page.waitForURL(/\/login/);
	});
});
