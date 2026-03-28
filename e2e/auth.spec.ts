import { expect, test } from "@playwright/test";

test.describe("Authentication", () => {
	test("login page renders correctly", async ({ page }) => {
		await page.goto("/login");

		const username = page.getByLabel("username");
		await expect(username).toBeVisible();
		await expect(username).toHaveValue("admin");
		await expect(username).toHaveAttribute("readonly", "");

		await expect(page.getByLabel("password")).toBeVisible();

		await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
	});

	test("valid login redirects to home", async ({ page }) => {
		await page.goto("/login");
		await page.getByLabel("password").fill("test-password");
		await page.getByRole("button", { name: "sign in" }).click();

		await page.waitForURL("/");
		await expect(page.getByText("press space to start")).toBeVisible();
	});

	test("invalid password shows error", async ({ page }) => {
		await page.goto("/login");
		await page.getByLabel("password").fill("wrong-password");
		await page.getByRole("button", { name: "sign in" }).click();

		await expect(page.locator(".text-destructive")).toBeVisible();
		expect(page.url()).toContain("/login");
	});

	test("protected route redirects to login", async ({ page }) => {
		await page.goto("/");
		await page.waitForURL(/\/login/);
		expect(page.url()).toContain("/login");
	});

	test("logout clears session", async ({ page }) => {
		await page.goto("/login");
		await page.getByLabel("password").fill("test-password");
		await page.getByRole("button", { name: "sign in" }).click();
		await page.waitForURL("/");

		await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

		await page.goto("/");
		await page.waitForURL(/\/login/);
	});

	test("auth cookie persists across page refresh", async ({ page }) => {
		await page.goto("/login");
		await page.getByLabel("password").fill("test-password");
		await page.getByRole("button", { name: "sign in" }).click();
		await page.waitForURL("/");

		await page.reload();
		await expect(page.getByText("press space to start")).toBeVisible();
		expect(page.url()).not.toContain("/login");
	});
});
