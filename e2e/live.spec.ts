/**
 * The real app against the real Spotify Web API.
 *
 * Needs `SPOTIFY_REFRESH_TOKEN` (see `bun run spotify:token`) and the
 * matching `PUBLIC_SPOTIFY_CLIENT_ID`; skipped otherwise.
 *
 * @module
 */
import { expect, test } from "@playwright/test";

const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

test.skip(!refreshToken, "SPOTIFY_REFRESH_TOKEN is not set");

test("lists the account's real playlists", async ({ page }) => {
	await page.route("https://sdk.scdn.co/**", (route) => route.abort());
	await page.addInitScript((token) => {
		window.localStorage.setItem(
			"spotify_token",
			JSON.stringify({
				accessToken: "expired",
				refreshToken: token,
				expiresAt: 0,
				scope: "",
			}),
		);
	}, refreshToken ?? "");
	const refreshed = page.waitForResponse(
		(r) => r.url().endsWith("/api/spotify/refresh") && r.status() === 200,
	);
	const playlists = page.waitForResponse(
		(r) =>
			r.url().startsWith("https://api.spotify.com/v1/me/playlists") &&
			r.status() === 200,
	);
	await page.goto("/");
	await refreshed;
	const body = await (await playlists).json();
	await page.getByRole("button", { name: "playlist" }).click();
	const first = body.items.find((item: { name?: string } | null) => item?.name);
	if (first) await expect(page.getByText(first.name).first()).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);
});
