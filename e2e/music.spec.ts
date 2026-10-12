/**
 * Now playing, devices, playlist search and pins, and music following the
 * pomodoro.
 *
 * @module
 */
import { expect, test } from "./fixtures";

test("shows the current track and skips", async ({
	connected: { page, spotify },
}) => {
	await page.getByRole("button", { name: "playlist" }).click();
	await page.getByText("Lofi Beats").click();
	const nowPlaying = page.getByRole("region", { name: "now playing" });
	await expect(nowPlaying).toContainText("Track 1");
	await expect(nowPlaying).toContainText("Lofi Artist");
	await nowPlaying.getByRole("button", { name: "next track" }).click();
	await expect(nowPlaying).toContainText("Track 2");
	await nowPlaying.getByRole("button", { name: "previous track" }).click();
	await expect(nowPlaying).toContainText("Track 1");
	expect(spotify.log).toEqual(expect.arrayContaining(["next", "previous"]));
});

test("sets the volume", async ({ connected: { page, spotify } }) => {
	await page.getByRole("button", { name: "playlist" }).click();
	await page.getByText("Lofi Beats").click();
	const volume = page.getByRole("slider", { name: "volume" });
	await expect(volume).toHaveValue("60");
	await volume.focus();
	await page.keyboard.press("ArrowRight");
	await expect.poll(() => spotify.volume).toBe(65);
});

test("moves playback to another device", async ({
	connected: { page, spotify },
}) => {
	await page.getByRole("button", { name: "playlist" }).click();
	await page.getByText("Lofi Beats").click();
	await page.getByRole("button", { name: "choose device" }).click();
	await page.getByRole("button", { name: "Pixel" }).click();
	await expect.poll(() => spotify.log).toContain("transfer:device-2");
	await expect(
		page.getByRole("button", { name: "choose device" }),
	).toContainText("Pixel");
});

test("searches every playlist and keeps pins first", async ({
	connected: { page },
}) => {
	await page.getByRole("button", { name: "playlist" }).click();
	const search = page.getByRole("searchbox", { name: "search playlists" });
	await expect(search).toBeFocused();
	await search.fill("rain");
	await expect(page.getByText("Rainy Study")).toBeVisible();
	await expect(page.getByText("Lofi Beats")).toBeHidden();
	await page.getByRole("button", { name: "pin Rainy Study" }).click();
	await search.fill("");
	await expect(page.locator("li button").first()).toContainText("Rainy Study");
	await page.reload();
	await page.getByRole("button", { name: "playlist" }).click();
	await expect(page.locator("li button").first()).toContainText("Rainy Study");
});

test("remembers the chosen playlist", async ({ connected: { page } }) => {
	await page.getByRole("button", { name: "playlist" }).click();
	await page.getByText("Jazz Vibes").click();
	await page.reload();
	await expect(page.getByRole("button", { name: "Jazz Vibes" })).toBeVisible();
});

test("music pauses for breaks and resumes for focus", async ({
	connected: { page, spotify },
}) => {
	await page.getByRole("button", { name: "playlist" }).click();
	await page.getByText("Lofi Beats").click();
	await expect
		.poll(() => spotify.log)
		.toContain("play:spotify:playlist:playlist-1");

	await page.getByRole("button", { name: "settings" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByLabel("Focus playlist")).toHaveValue("playlist-1");
	await dialog.getByLabel("On breaks").selectOption("pause");
	await dialog.getByRole("button", { name: "Save" }).click();

	spotify.log.length = 0;
	await page.getByRole("button", { name: "start" }).click();
	await expect
		.poll(() => spotify.log)
		.toEqual(["play:spotify:playlist:playlist-1"]);
	await page.keyboard.press("b");
	await expect.poll(() => spotify.log).toContain("pause");
	await page.keyboard.press("f");
	await expect.poll(() => spotify.log.at(-1)).toBe("resume");
});

test("music switches to the break playlist", async ({
	connected: { page, spotify },
}) => {
	await page.getByRole("button", { name: "settings" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Focus playlist").selectOption("playlist-1");
	await dialog.getByLabel("On breaks").selectOption("playlist");
	await dialog.getByLabel("Break playlist").selectOption("playlist-3");
	await dialog.getByRole("button", { name: "Save" }).click();

	await page.getByRole("button", { name: "start" }).click();
	await expect
		.poll(() => spotify.log)
		.toContain("play:spotify:playlist:playlist-1");
	await page.keyboard.press("b");
	await expect
		.poll(() => spotify.log)
		.toContain("play:spotify:playlist:playlist-3");
});
