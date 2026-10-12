/**
 * Derived values on shared domain models.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import { loginErrorMessage, safeReturnPath } from "@/client/login";
import { PlayerView } from "@/client/Playback";
import { arrangePlaylists } from "@/components/Spotify";
import {
	BROWSER_DEVICE_NAME,
	PlaybackState,
	Playlist,
	SpotifyToken,
} from "@/shared/domain/Spotify";
import { TIMER_PRESETS, TimerState } from "@/shared/domain/Timer";

describe("TimerState", () => {
	it.prop("formats remaining time as MM:SS", [TimerState], ([state]) => {
		const shown = state.isOvertime
			? state.overtimeSeconds
			: state.remainingSeconds;
		const [minutes, seconds] = state.displayTime.replace("+", "").split(":");
		return (
			state.displayTime.startsWith("+") === state.isOvertime &&
			Number(minutes) * 60 + Number(seconds) === shown &&
			(seconds ?? "").length === 2 &&
			(minutes ?? "").length >= 2
		);
	});

	it("idle shows the focus duration and no elapsed time", () => {
		for (const config of Object.values(TIMER_PRESETS)) {
			const idle = TimerState.idle(config);
			assert.strictEqual(idle.remainingSeconds, config.focusSeconds);
			assert.strictEqual(idle.elapsedSeconds, 0);
			assert.isFalse(idle.isOvertime);
		}
	});

	it("shows three-digit minutes in long overtime", () => {
		const state = new TimerState({
			phase: "focus",
			status: "running",
			remainingSeconds: 0,
			overtimeSeconds: 100 * 60 + 5,
			config: TIMER_PRESETS.classic,
			focusCompleted: 0,
		});
		assert.strictEqual(state.displayTime, "+100:05");
	});
});

describe("Spotify models", () => {
	it.prop(
		"tokens expire a minute early",
		[SpotifyToken],
		([token]) =>
			token.isExpiredAt(token.expiresAt - 60_000) &&
			!token.isExpiredAt(token.expiresAt - 60_001),
	);

	it.prop(
		"device source follows the device name",
		[PlaybackState],
		([state]) =>
			state.deviceSource ===
			(state.deviceName === null
				? null
				: state.deviceName === BROWSER_DEVICE_NAME
					? "browser"
					: "remote"),
	);

	it.prop(
		"the vinyl spins while playing or about to play",
		[PlayerView],
		([view]) =>
			view.isPlaying ===
			(view.playingIntent ||
				(view.playback._tag === "Some" && view.playback.value.isPlaying)),
	);
});

describe("login", () => {
	it.prop(
		"only ever returns to a same-origin path",
		[Schema.String],
		([value]) => {
			const path = safeReturnPath(value);
			return new URL(path, "https://app.test").origin === "https://app.test";
		},
	);

	it("keeps safe paths and drops external ones", () => {
		assert.strictEqual(safeReturnPath("/stats?x=1"), "/stats?x=1");
		assert.strictEqual(safeReturnPath(null), "/");
		assert.strictEqual(safeReturnPath("https://evil.example"), "/");
		assert.strictEqual(safeReturnPath("//evil.example"), "/");
		assert.strictEqual(safeReturnPath("/\\evil.example"), "/");
		assert.strictEqual(safeReturnPath("/\t/evil.example"), "/");
		assert.strictEqual(safeReturnPath("/\n/evil.example"), "/");
	});

	it("explains login failures", () => {
		assert.strictEqual(
			loginErrorMessage({ _tag: "InvalidCredentials" }),
			"Invalid credentials",
		);
		assert.strictEqual(
			loginErrorMessage({ _tag: "AuthDisabled" }),
			"Login is not enabled on this server",
		);
		assert.strictEqual(
			loginErrorMessage({ _tag: "HttpClientError" }),
			"Connection failed",
		);
	});
});

describe("playlist picker ordering", () => {
	it("puts pinned playlists first and filters by name", () => {
		const make = (id: string, name: string) =>
			new Playlist({ id, name, uri: `spotify:playlist:${id}`, imageUrl: null });
		const all = [make("a", "Lofi"), make("b", "Jazz"), make("c", "Lofi Jazz")];
		assert.deepStrictEqual(
			arrangePlaylists(all, ["c"], "").map((p) => p.id),
			["c", "a", "b"],
		);
		assert.deepStrictEqual(
			arrangePlaylists(all, ["b"], "jazz").map((p) => p.id),
			["b", "c"],
		);
	});
});
