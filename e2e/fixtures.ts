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
	readonly calls: Record<
		| "play"
		| "pause"
		| "shuffle"
		| "repeat"
		| "volume"
		| "next"
		| "previous"
		| "transfer",
		number
	>;
	readonly log: Array<string>;
	noDevice: boolean;
	isPlaying: boolean;
	volume: number;
	device: { id: string; name: string };
}

const EXTRA_PLAYLIST = {
	id: "playlist-4",
	name: "Rainy Study",
	uri: "spotify:playlist:playlist-4",
	images: [],
};

const DEVICES = [
	{
		id: "device-1",
		name: "Desk Speaker",
		type: "Speaker",
		is_active: true,
		is_restricted: false,
	},
	{
		id: "device-2",
		name: "Pixel",
		type: "Smartphone",
		is_active: false,
		is_restricted: false,
	},
];

const mockSpotify = async (page: Page): Promise<SpotifyMock> => {
	const mock: SpotifyMock = {
		calls: {
			play: 0,
			pause: 0,
			shuffle: 0,
			repeat: 0,
			volume: 0,
			next: 0,
			previous: 0,
			transfer: 0,
		},
		log: [],
		noDevice: false,
		isPlaying: false,
		volume: 60,
		device: { id: "device-1", name: "Desk Speaker" },
	};
	await page.route("https://sdk.scdn.co/**", (route) => route.abort());
	await page.route("https://i.scdn.co/**", (route) => route.abort());
	await page.route("https://api.spotify.com/**", (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		const method = request.method();
		if (method === "GET" && path === "/v1/me/playlists") {
			return url.searchParams.get("offset") === "50"
				? route.fulfill({ json: { next: null, items: [EXTRA_PLAYLIST] } })
				: route.fulfill({
						json: {
							next: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
							items: PLAYLISTS,
						},
					});
		}
		if (method === "GET" && path === "/v1/me/player/devices") {
			return route.fulfill({ json: { devices: DEVICES } });
		}
		if (method === "GET" && path === "/v1/me/player") {
			return mock.noDevice
				? route.fulfill({ status: 204 })
				: route.fulfill({
						json: {
							is_playing: mock.isPlaying,
							device: { ...mock.device, volume_percent: mock.volume },
							context: { uri: "spotify:playlist:playlist-1" },
							item: {
								name: `Track ${mock.calls.next - mock.calls.previous + 1}`,
								artists: [{ name: "Lofi Artist" }],
								album: { images: [{ url: "https://i.scdn.co/image/art" }] },
							},
						},
					});
		}
		if (method === "PUT" && path === "/v1/me/player") {
			const body = request.postDataJSON();
			const target = DEVICES.find((d) => d.id === body.device_ids[0]);
			if (target) mock.device = { id: target.id, name: target.name };
			mock.calls.transfer++;
			mock.log.push(`transfer:${body.device_ids[0]}`);
			return route.fulfill({ status: 204 });
		}
		const command = path.split("/").at(-1);
		if (method === "POST" && (command === "next" || command === "previous")) {
			mock.calls[command]++;
			mock.log.push(command);
			return route.fulfill({ status: 204 });
		}
		if (
			method === "PUT" &&
			(command === "play" ||
				command === "pause" ||
				command === "shuffle" ||
				command === "repeat" ||
				command === "volume")
		) {
			if (mock.noDevice) return route.fulfill({ status: 404 });
			mock.calls[command]++;
			if (command === "play") {
				mock.isPlaying = true;
				const body = request.postData();
				mock.log.push(body ? `play:${JSON.parse(body).context_uri}` : "resume");
			}
			if (command === "pause") {
				mock.isPlaying = false;
				mock.log.push("pause");
			}
			if (command === "volume") {
				mock.volume = Number(url.searchParams.get("volume_percent"));
				mock.log.push(`volume:${mock.volume}`);
			}
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
