/**
 * One-time handling of the URL the app was opened with.
 *
 * @module
 */
import { Effect, Layer, Option } from "effect";
import { TOKEN_FRAGMENT } from "@/shared/domain/Spotify";
import { Playback } from "./Playback";
import { decodeRedirectToken, SpotifyAuth } from "./SpotifyAuth";

/**
 * Stores a token handed over by the OAuth callback, surfaces a callback
 * error, and strips both from the address bar.
 *
 * @since 2.0.0
 * @category Layers
 */
export const StartupLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const auth = yield* SpotifyAuth;
		const playback = yield* Playback;
		const url = new URL(window.location.href);
		const hash = new URLSearchParams(url.hash.slice(1));
		const token = Option.flatMap(
			Option.fromNullOr(hash.get(TOKEN_FRAGMENT)),
			decodeRedirectToken,
		);
		const error = url.searchParams.get("error");
		if (Option.isSome(token)) yield* auth.save(token.value);
		if (error) yield* playback.showError(`Spotify connection failed: ${error}`);
		if (Option.isSome(token) || error || hash.has(TOKEN_FRAGMENT)) {
			yield* Effect.sync(() =>
				window.history.replaceState(null, "", url.pathname),
			);
		}
	}).pipe(Effect.withSpan("Startup")),
);
