/**
 * User preferences, persisted in the browser.
 *
 * @module
 */
import { Context, Effect, Layer, Option, SubscriptionRef } from "effect";
import { KeyValueStore } from "effect/persistence";
import { Settings } from "@/shared/domain/Settings";

/**
 * Storage key for settings.
 *
 * @since 2.1.0
 * @category Config
 */
export const SETTINGS_STORAGE_KEY = "pomodoro_settings";

/**
 * Current settings, saved on every change. Unreadable or outdated stored
 * settings fall back to the defaults.
 *
 * @since 2.1.0
 * @category Services
 */
export class SettingsStore extends Context.Service<SettingsStore>()(
	"spotify-pomodoro/client/SettingsStore",
	{
		make: Effect.gen(function* () {
			const store = KeyValueStore.toSchemaStore(
				yield* KeyValueStore.KeyValueStore,
				Settings,
			);
			const settings = yield* SubscriptionRef.make(
				yield* store.get(SETTINGS_STORAGE_KEY).pipe(
					Effect.map(Option.getOrElse(() => Settings.defaults)),
					Effect.catch(() => Effect.succeed(Settings.defaults)),
				),
			);

			const update = Effect.fn("SettingsStore.update")(function* (
				f: (current: Settings) => Settings,
			) {
				const next = yield* SubscriptionRef.updateAndGet(settings, f);
				yield* store.set(SETTINGS_STORAGE_KEY, next).pipe(Effect.ignore);
				return next;
			});

			return {
				settings,
				get: SubscriptionRef.get(settings),
				changes: SubscriptionRef.changes(settings),
				update,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
