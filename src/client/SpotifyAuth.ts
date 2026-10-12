/**
 * The browser's Spotify token: persistence, refresh, and connection state.
 *
 * @module
 */
import {
	Clock,
	Context,
	Effect,
	Layer,
	Option,
	Schema,
	Semaphore,
	Stream,
	SubscriptionRef,
} from "effect";
import { KeyValueStore } from "effect/persistence";
import {
	SpotifyNotConnected,
	SpotifyToken,
	SpotifyUnavailable,
} from "@/shared/domain/Spotify";
import { ApiClient } from "./ApiClient";

/**
 * Storage key for the token.
 *
 * @since 2.0.0
 * @category Config
 */
export const TOKEN_STORAGE_KEY = "spotify_token";

/**
 * Decodes the token carried in the callback redirect.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const decodeRedirectToken = Schema.decodeUnknownOption(
	Schema.fromJsonString(SpotifyToken),
);

/**
 * Holds the Spotify token, refreshing it through the server when it is about
 * to expire.
 *
 * Storage is re-read before each use so tabs pick up tokens refreshed by
 * other tabs. The token is only forgotten when Spotify rejects it and no
 * other tab has replaced it; outages fail with `SpotifyUnavailable`.
 *
 * @since 0.0.1
 * @category Services
 */
export class SpotifyAuth extends Context.Service<SpotifyAuth>()(
	"spotify-pomodoro/client/SpotifyAuth",
	{
		make: Effect.gen(function* () {
			const api = yield* ApiClient;
			const store = KeyValueStore.toSchemaStore(
				yield* KeyValueStore.KeyValueStore,
				SpotifyToken,
			);
			const stored = yield* store
				.get(TOKEN_STORAGE_KEY)
				.pipe(Effect.catch(() => Effect.succeedNone));
			const token = yield* SubscriptionRef.make(stored);
			const refreshLock = yield* Semaphore.make(1);

			const save = Effect.fn("SpotifyAuth.save")(function* (
				next: SpotifyToken,
			) {
				yield* SubscriptionRef.set(token, Option.some(next));
				yield* store.set(TOKEN_STORAGE_KEY, next).pipe(Effect.ignore);
			});

			const disconnect = Effect.fn("SpotifyAuth.disconnect")(function* () {
				yield* SubscriptionRef.set(token, Option.none());
				yield* store.remove(TOKEN_STORAGE_KEY).pipe(Effect.ignore);
			});

			const notConnected = new SpotifyNotConnected({
				message: "Connect Spotify first",
			});

			const readStored = store
				.get(TOKEN_STORAGE_KEY)
				.pipe(Effect.catch(() => Effect.succeedNone));

			const refresh = Effect.fn("SpotifyAuth.refresh")(function* (
				current: SpotifyToken,
			) {
				const refreshed = yield* api.spotify
					.refresh({ payload: { refreshToken: current.refreshToken } })
					.pipe(
						Effect.catchTag("SpotifyNotConnected", () =>
							Effect.gen(function* () {
								const latest = yield* readStored;
								if (
									Option.isNone(latest) ||
									latest.value.refreshToken === current.refreshToken
								) {
									yield* disconnect();
								}
								return yield* new SpotifyNotConnected({
									message: "Spotify session expired, reconnect Spotify",
								});
							}),
						),
						Effect.catchIf(
							(error) => error._tag !== "SpotifyNotConnected",
							() =>
								Effect.fail(
									new SpotifyUnavailable({
										message: "Spotify is unreachable right now",
									}),
								),
						),
					);
				yield* save(refreshed);
				return refreshed;
			});

			const accessToken = refreshLock
				.withPermits(1)(
					Effect.gen(function* () {
						const inMemory = yield* SubscriptionRef.get(token);
						const latest = yield* readStored;
						const newer =
							Option.isSome(latest) &&
							Option.match(inMemory, {
								onNone: () => true,
								onSome: (held) => latest.value.expiresAt > held.expiresAt,
							});
						if (newer) yield* SubscriptionRef.set(token, latest);
						const current = newer ? latest : inMemory;
						if (Option.isNone(current)) return yield* notConnected;
						const now = yield* Clock.currentTimeMillis;
						const valid = current.value.isExpiredAt(now)
							? yield* refresh(current.value)
							: current.value;
						return valid.accessToken;
					}),
				)
				.pipe(Effect.withSpan("SpotifyAuth.accessToken"));

			return {
				accessToken,
				save,
				disconnect,
				isConnected: SubscriptionRef.get(token).pipe(Effect.map(Option.isSome)),
				connectedChanges: SubscriptionRef.changes(token).pipe(
					Stream.map(Option.isSome),
					Stream.changes,
				),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
