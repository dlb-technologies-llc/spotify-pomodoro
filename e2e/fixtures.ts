import type { Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

const PLAYLISTS = [
	{
		id: "playlist-1",
		name: "Lofi Beats",
		uri: "spotify:playlist:playlist-1",
		images: [{ url: "https://i.scdn.co/image/1" }],
	},
	{
		id: "playlist-2",
		name: "Focus Flow",
		uri: "spotify:playlist:playlist-2",
		images: [],
	},
	{
		id: "playlist-3",
		name: "Jazz Vibes",
		uri: "spotify:playlist:playlist-3",
		images: null,
	},
];

/**
 * A Spotify token the app treats as valid for an hour.
 */
export const mockToken = () => ({
	accessToken: "mock-access-token",
	refreshToken: "mock-refresh-token",
	expiresAt: Date.now() + 3_600_000,
	scope:
		"user-read-playback-state user-modify-playback-state playlist-read-private streaming",
});

interface SpotifyMock {
	readonly calls: Record<"play" | "pause" | "shuffle" | "repeat", number>;
	noDevice: boolean;
	isPlaying: boolean;
}

const mockSpotify = async (page: Page): Promise<SpotifyMock> => {
	const mock: SpotifyMock = {
		calls: { play: 0, pause: 0, shuffle: 0, repeat: 0 },
		noDevice: false,
		isPlaying: false,
	};
	await page.route("https://sdk.scdn.co/**", (route) => route.abort());
	await page.route("https://i.scdn.co/**", (route) => route.abort());
	await page.route("https://api.spotify.com/**", (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const method = request.method();
		if (method === "GET" && path === "/v1/me/playlists") {
			return route.fulfill({ json: { items: PLAYLISTS } });
		}
		if (method === "GET" && path === "/v1/me/player") {
			return mock.noDevice
				? route.fulfill({ status: 204 })
				: route.fulfill({
						json: {
							is_playing: mock.isPlaying,
							device: { id: "device-1", name: "Desk Speaker" },
							context: { uri: "spotify:playlist:playlist-1" },
						},
					});
		}
		const command = path.split("/").at(-1);
		if (
			method === "PUT" &&
			(command === "play" ||
				command === "pause" ||
				command === "shuffle" ||
				command === "repeat")
		) {
			if (mock.noDevice) return route.fulfill({ status: 404 });
			mock.calls[command]++;
			if (command === "play") mock.isPlaying = true;
			if (command === "pause") mock.isPlaying = false;
			return route.fulfill({ status: 204 });
		}
		return route.fulfill({ status: 500 });
	});
	return mock;
};

export const test = base.extend<{
	spotify: SpotifyMock;
	connected: { page: Page; spotify: SpotifyMock };
}>({
	spotify: async ({ page }, use) => {
		await use(await mockSpotify(page));
	},
	connected: async ({ page, spotify }, use) => {
		await page.addInitScript((token) => {
			window.localStorage.setItem("spotify_token", token);
		}, JSON.stringify(mockToken()));
		await page.goto("/");
		await page.getByRole("button", { name: "playlist" }).waitFor();
		await use({ page, spotify });
	},
});

export { expect };
