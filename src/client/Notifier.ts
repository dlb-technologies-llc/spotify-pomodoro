/**
 * Desktop notifications for phase changes.
 *
 * @module
 */
import { Context, Effect, Layer, Predicate } from "effect";

/**
 * Shows a system notification when the page is not in front of the user;
 * clicking it brings the app back.
 *
 * Permission is requested once, from a user action such as starting the
 * timer; browsers ignore requests made without one.
 *
 * @since 2.1.0
 * @category Services
 */
export class Notifier extends Context.Service<Notifier>()(
	"spotify-pomodoro/client/Notifier",
	{
		make: Effect.sync(() => {
			const supported = Predicate.hasProperty(globalThis, "Notification");

			const requestPermission = Effect.suspend(() =>
				supported && Notification.permission === "default"
					? Effect.promise(() => Notification.requestPermission()).pipe(
							Effect.asVoid,
							Effect.ignore,
						)
					: Effect.void,
			).pipe(Effect.withSpan("Notifier.requestPermission"));

			const notify = (title: string, body: string) =>
				Effect.sync(() => {
					if (!supported || Notification.permission !== "granted") return;
					if (document.visibilityState === "visible" && document.hasFocus()) {
						return;
					}
					const notification = new Notification(title, {
						body,
						icon: "/favicon.svg",
						tag: "spotify-pomodoro-phase",
					});
					notification.addEventListener("click", () => {
						window.focus();
						notification.close();
					});
				}).pipe(Effect.ignore, Effect.withSpan("Notifier.notify"));

			return { requestPermission, notify };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);

	/**
	 * Does nothing; for tests and unsupported environments.
	 *
	 * @since 2.1.0
	 */
	static readonly layerNoop = Layer.succeed(this, {
		requestPermission: Effect.void,
		notify: () => Effect.void,
	});
}
