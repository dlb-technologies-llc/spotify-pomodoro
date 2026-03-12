import type { Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

const MOCK_PLAYLISTS = [
	{
		id: "playlist-1",
		name: "Lofi Beats",
		description: "Chill beats for studying",
		uri: "spotify:playlist:playlist-1",
		images: [
			{ url: "https://via.placeholder.com/300", height: 300, width: 300 },
		],
		owner: { id: "user-1", display_name: "Test User" },
		tracks: { total: 42 },
	},
	{
		id: "playlist-2",
		name: "Focus Flow",
		description: "Deep focus music",
		uri: "spotify:playlist:playlist-2",
		images: [
			{ url: "https://via.placeholder.com/300", height: 300, width: 300 },
		],
		owner: { id: "user-1", display_name: "Test User" },
		tracks: { total: 28 },
	},
	{
		id: "playlist-3",
		name: "Jazz Vibes",
		description: "Smooth jazz",
		uri: "spotify:playlist:playlist-3",
		images: [
			{ url: "https://via.placeholder.com/300", height: 300, width: 300 },
		],
		owner: { id: "user-1", display_name: "Test User" },
		tracks: { total: 55 },
	},
];

function createMockToken() {
	return {
		accessToken: "mock-access-token-for-e2e-testing",
		refreshToken: "mock-refresh-token",
		expiresAt: Date.now() + 3600000,
		scope:
			"user-read-playback-state user-modify-playback-state playlist-read-private streaming",
	};
}

interface SpotifyMock {
	callCounts: {
		play: number;
		pause: number;
		shuffle: number;
		repeat: number;
	};
	isPlaying: boolean;
	setNoDevice: () => void;
}

async function setupSpotifyMock(page: Page): Promise<SpotifyMock> {
	const mock: SpotifyMock = {
		callCounts: { play: 0, pause: 0, shuffle: 0, repeat: 0 },
		isPlaying: false,
		setNoDevice: () => {
			noDevice = true;
		},
	};

	let noDevice = false;

	await page.route("**/api.spotify.com/**", (route) => {
		const url = new URL(route.request().url());
		const method = route.request().method();
		const path = url.pathname;

		if (method === "GET" && path.endsWith("/me/playlists")) {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					items: MOCK_PLAYLISTS,
					total: MOCK_PLAYLISTS.length,
					limit: 50,
					offset: 0,
				}),
			});
		}

		if (method === "GET" && path.endsWith("/me/player")) {
			if (noDevice) {
				return route.fulfill({ status: 404 });
			}
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					is_playing: mock.isPlaying,
					device: {
						id: "device-1",
						name: "Test Device",
						type: "Computer",
						volume_percent: 50,
						is_active: true,
					},
					shuffle_state: false,
					repeat_state: "off",
					progress_ms: 0,
					item: {
						name: "Test Track",
						artists: [{ name: "Test Artist" }],
						album: {
							name: "Test Album",
							images: [
								{
									url: "https://via.placeholder.com/300",
									height: 300,
									width: 300,
								},
							],
						},
						duration_ms: 240000,
					},
				}),
			});
		}

		if (method === "PUT" && path.endsWith("/me/player/play")) {
			if (noDevice) {
				return route.fulfill({ status: 404 });
			}
			mock.callCounts.play++;
			mock.isPlaying = true;
			return route.fulfill({ status: 204 });
		}

		if (method === "PUT" && path.endsWith("/me/player/pause")) {
			if (noDevice) {
				return route.fulfill({ status: 404 });
			}
			mock.callCounts.pause++;
			mock.isPlaying = false;
			return route.fulfill({ status: 204 });
		}

		if (method === "PUT" && path.endsWith("/me/player/shuffle")) {
			if (noDevice) {
				return route.fulfill({ status: 404 });
			}
			mock.callCounts.shuffle++;
			return route.fulfill({ status: 204 });
		}

		if (method === "PUT" && path.endsWith("/me/player/repeat")) {
			if (noDevice) {
				return route.fulfill({ status: 404 });
			}
			mock.callCounts.repeat++;
			return route.fulfill({ status: 204 });
		}

		return route.abort();
	});

	return mock;
}

type TestFixtures = {
	spotifyMock: SpotifyMock;
	spotifyConnectedPage: { page: Page; mock: SpotifyMock };
};

export const test = base.extend<TestFixtures>({
	spotifyMock: async ({ page }, use) => {
		const mock = await setupSpotifyMock(page);
		await use(mock);
	},

	spotifyConnectedPage: async ({ page, spotifyMock }, use) => {
		const tokenPayload = JSON.stringify(createMockToken());
		await page.addInitScript((token) => {
			window.localStorage.setItem("spotify_token", token);
		}, tokenPayload);

		await page.goto("/");
		await page.getByText("press space to start").waitFor();
		await page.getByRole("button", { name: /playlist/i }).waitFor();

		await use({ page, mock: spotifyMock });
	},
});

export { expect };
