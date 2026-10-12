/**
 * Lockout after repeated failed logins.
 *
 * @module
 */
import { Clock, Context, Effect, Layer, Ref } from "effect";
import { PEER_HEADER, TooManyAttempts } from "@/shared/domain/Auth";
import { ServerConfig } from "./ServerConfig";

/**
 * Identifies the client a request came from: the first `X-Forwarded-For`
 * address when the server sits behind a trusted proxy, otherwise the
 * connection's address.
 *
 * @since 2.1.0
 * @category Helpers
 */
export const clientKey = (
	headers: Readonly<Record<string, string | undefined>>,
	trustProxy: boolean,
): string => {
	const forwarded = headers["x-forwarded-for"]?.split(",")[0]?.trim();
	if (trustProxy && forwarded) return forwarded;
	return headers[PEER_HEADER] ?? "unknown";
};

/**
 * Counts failed logins per client. After `AUTH_MAX_ATTEMPTS` failures within
 * `AUTH_LOCKOUT_SECONDS`, the client is locked out for that long; a
 * successful login clears its history. Clients are keyed by network
 * address (see {@link clientKey}); state is per process.
 *
 * @since 2.1.0
 * @category Services
 */
export class LoginLimiter extends Context.Service<LoginLimiter>()(
	"spotify-pomodoro/server/LoginLimiter",
	{
		make: Effect.gen(function* () {
			const { maxLoginAttempts, lockoutSeconds } = yield* ServerConfig;
			const windowMs = lockoutSeconds * 1000;
			const failures = yield* Ref.make(
				new Map<string, ReadonlyArray<number>>(),
			);

			const recent = (now: number, times: ReadonlyArray<number> | undefined) =>
				(times ?? []).filter((time) => now - time < windowMs);

			const check = Effect.fn("LoginLimiter.check")(function* (client: string) {
				const now = yield* Clock.currentTimeMillis;
				const times = recent(now, (yield* Ref.get(failures)).get(client));
				if (times.length < maxLoginAttempts) return;
				const oldest = times[0] ?? now;
				return yield* new TooManyAttempts({
					retryAfterSeconds: Math.max(
						1,
						Math.ceil((oldest + windowMs - now) / 1000),
					),
				});
			});

			const fail = Effect.fn("LoginLimiter.fail")(function* (client: string) {
				const now = yield* Clock.currentTimeMillis;
				yield* Ref.update(failures, (map) => {
					const next = new Map<string, ReadonlyArray<number>>();
					for (const [key, times] of map) {
						const kept = recent(now, times);
						if (kept.length > 0) next.set(key, kept);
					}
					next.set(client, [...recent(now, map.get(client)), now]);
					return next;
				});
			});

			const succeed = (client: string) =>
				Ref.update(failures, (map) => {
					const next = new Map(map);
					next.delete(client);
					return next;
				});

			return { check, fail, succeed };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
