import { expect, test } from "./fixtures";

test.describe("Spotify Integration", () => {
	test("connect button visible when disconnected", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("button", { name: "spotify" })).toBeVisible();
	});

	test("token injection shows connected UI", async ({
		spotifyConnectedPage: { page },
	}) => {
		await expect(
			page.getByRole("button", { name: "spotify" }),
		).not.toBeVisible();
		await expect(page.getByRole("button", { name: /playlist/ })).toBeVisible();
	});

	test("playlist selector shows playlists", async ({
		spotifyConnectedPage: { page },
	}) => {
		await page.getByRole("button", { name: /playlist/ }).click();

		await expect(page.getByText("Lofi Beats")).toBeVisible();
		await expect(page.getByText("Focus Flow")).toBeVisible();
		await expect(page.getByText("Jazz Vibes")).toBeVisible();
	});

	test("select playlist triggers playback", async ({
		spotifyConnectedPage: { page, mock },
	}) => {
		await page.getByRole("button", { name: /playlist/ }).click();
		await page.getByText("Lofi Beats").click();

		expect(mock.callCounts.play).toBeGreaterThan(0);
	});

	test("play/pause toggle", async ({
		spotifyConnectedPage: { page, mock },
	}) => {
		await page.getByRole("button", { name: /playlist/ }).click();
		await page.getByText("Lofi Beats").click();

		const vinylButton = page.locator("button").filter({
			has: page.locator(".animate-spin-slow"),
		});
		await vinylButton.click();

		expect(mock.callCounts.pause).toBeGreaterThan(0);
	});

	test("no device error", async ({ spotifyConnectedPage: { page, mock } }) => {
		mock.setNoDevice();

		await page.getByRole("button", { name: /playlist/ }).click();
		await page.getByText("Lofi Beats").click();

		await expect(
			page.getByText("Open Spotify on your phone or computer first"),
		).toBeVisible();
	});

	test("disconnect clears token", async ({
		spotifyConnectedPage: { page },
	}) => {
		const disconnectButton = page.locator("button.text-xs", {
			hasText: "×",
		});

		await disconnectButton.click();

		await expect(page.getByRole("button", { name: "spotify" })).toBeVisible();

		const token = await page.evaluate(() =>
			localStorage.getItem("spotify_token"),
		);
		expect(token).toBeNull();
	});
});
