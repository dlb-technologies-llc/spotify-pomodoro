import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "blob" : "html",
	use: {
		baseURL: "http://localhost:2500",
		trace: "on-first-retry",
	},
	expect: {
		timeout: 10_000,
	},
	projects: [
		{ name: "setup", testMatch: /.*\.setup\.ts/ },
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: "playwright/.auth/user.json",
			},
			dependencies: ["setup"],
		},
		{
			name: "no-auth",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /auth\.spec\.ts/,
		},
	],
	webServer: {
		command:
			"bun run db:clean && bun run db:migrate && bun run build && bun run preview",
		url: "http://localhost:2500",
		timeout: 120_000,
		reuseExistingServer: !process.env.CI,
		env: {
			AUTH_ENABLED: "true",
			AUTH_PASSWORD: "test-password",
			AUTH_SECRET: "test-secret-for-playwright-e2e-testing-32chars",
		},
	},
});
