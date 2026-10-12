import { expect, mockToken, test } from "./fixtures";

test.describe("Spotify", () => {
	test("offers to connect when no token is stored", async ({
		page,
		spotify: _,
	}) => {
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: "connect spotify" }),
		).toBeVisible();
	});

	test("connect starts the OAuth flow on the server", async ({ page }) => {
		await page.route("**/api/spotify/authorize", (route) =>
			route.fulfill({ body: "authorize requested" }),
		);
		await page.goto("/");
		await page.getByRole("button", { name: "connect spotify" }).click();
		await expect(page.getByText("authorize requested")).toBeVisible();
	});

	test("authorize redirects to Spotify with PKCE", async ({ page }) => {
		const response = await page.request.get("/api/spotify/authorize", {
			maxRedirects: 0,
		});
		expect(response.status()).toBe(302);
		const location = new URL(response.headers().location ?? "");
		expect(location.origin + location.pathname).toBe(
			"https://accounts.spotify.com/authorize",
		);
		expect(location.searchParams.get("code_challenge_method")).toBe("S256");
		expect(location.searchParams.get("redirect_uri")).toMatch(/\/callback$/);
		expect(response.headers()["set-cookie"]).toMatch(
			/spotify_pkce=.*HttpOnly/i,
		);
	});

	test("adopts the token handed back by the callback", async ({
		page,
		spotify: _,
	}) => {
		const token = JSON.stringify(mockToken());
		await page.goto(`/#spotify_token=${encodeURIComponent(token)}`);
		await expect(page.getByRole("button", { name: "playlist" })).toBeVisible();
		await expect(page).toHaveURL(/\/$/);
		expect(
			await page.evaluate(() => localStorage.getItem("spotify_token")),
		).toBe(token);
	});

	test("reports a failed connection", async ({ page }) => {
		await page.goto("/?error=access_denied");
		await expect(
			page.getByText("Spotify connection failed: access_denied"),
		).toBeVisible();
		await expect(page).toHaveURL(/\/$/);
	});

	test("lists playlists", async ({ connected: { page } }) => {
		await page.getByRole("button", { name: "playlist" }).click();
		for (const name of [
			"Lofi Beats",
			"Focus Flow",
			"Jazz Vibes",
			"Rainy Study",
		]) {
			await expect(page.getByText(name)).toBeVisible();
		}
	});

	test("selecting a playlist plays it on shuffle and repeat", async ({
		connected: { page, spotify },
	}) => {
		await page.getByRole("button", { name: "playlist" }).click();
		await page.getByText("Lofi Beats").click();
		await expect
			.poll(() => [
				spotify.calls.play,
				spotify.calls.shuffle,
				spotify.calls.repeat,
			])
			.toEqual([1, 1, 1]);
		await expect(
			page.getByRole("button", { name: "choose device" }),
		).toContainText("Desk Speaker");
	});

	test("the vinyl pauses and resumes", async ({
		connected: { page, spotify },
	}) => {
		await page.getByRole("button", { name: "playlist" }).click();
		await page.getByText("Lofi Beats").click();
		await page.getByRole("button", { name: "pause" }).click();
		await expect.poll(() => spotify.calls.pause).toBe(1);
		await page.getByRole("button", { name: "play", exact: true }).click();
		await expect.poll(() => spotify.calls.play).toBe(2);
	});

	test("explains when there is nowhere to play", async ({
		connected: { page, spotify },
	}) => {
		spotify.noDevice = true;
		await page.getByRole("button", { name: "playlist" }).click();
		await page.getByText("Lofi Beats").click();
		await expect(
			page.getByText("Open Spotify on your phone or computer first"),
		).toBeVisible();
		await page.getByRole("button", { name: "dismiss" }).click();
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("disconnect forgets the token", async ({ connected: { page } }) => {
		await page.getByRole("button", { name: "disconnect spotify" }).click();
		await expect(
			page.getByRole("button", { name: "connect spotify" }),
		).toBeVisible();
		expect(
			await page.evaluate(() => localStorage.getItem("spotify_token")),
		).toBeNull();
	});
});
