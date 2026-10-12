import { defineConfig, devices } from "@playwright/test";

const PORT = 2500;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	expect: {
		timeout: 10_000,
		toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
	},
	projects: [
		{ name: "setup", testMatch: /auth\.setup\.ts/ },
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: "playwright/.auth/user.json",
			},
			dependencies: ["setup"],
			testIgnore: [/auth\.spec\.ts/, /live\.spec\.ts/, /visual\.spec\.ts/],
		},
		{
			name: "no-auth",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /auth\.spec\.ts/,
		},
		{
			name: "visual",
			use: {
				...devices["Desktop Chrome"],
				storageState: "playwright/.auth/user.json",
			},
			dependencies: ["setup"],
			testMatch: /visual\.spec\.ts/,
		},
		{
			name: "live",
			use: {
				...devices["Desktop Chrome"],
				storageState: "playwright/.auth/user.json",
			},
			dependencies: ["setup"],
			testMatch: /live\.spec\.ts/,
		},
	],
	webServer: {
		command: "rm -f data/e2e.db && bun run build && bun run start",
		url: `http://localhost:${PORT}/api/health`,
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
		env: {
			DATABASE_URL: "file:./data/e2e.db",
			AUTH_ENABLED: "true",
			AUTH_PASSWORD: "test-password",
			AUTH_SECRET: "test-secret-for-playwright-e2e-testing-32chars",
			PUBLIC_SPOTIFY_CLIENT_ID:
				process.env.PUBLIC_SPOTIFY_CLIENT_ID ?? "e2e-client-id",
			LOG_LEVEL: "warning",
			HOST: "localhost",
			PORT: String(PORT),
		},
	},
});
