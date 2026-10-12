/**
 * Short-lived success, info, and error messages.
 *
 * @module
 */
import {
	Context,
	type Duration,
	Effect,
	Layer,
	Ref,
	Schema,
	SubscriptionRef,
} from "effect";

/**
 * Toast severity.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const ToastKind = Schema.Literals(["success", "info", "error"]);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type ToastKind = typeof ToastKind.Type;

/**
 * One message on screen.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class Toast extends Schema.Class<Toast>("Toast")({
	id: Schema.Int,
	kind: ToastKind,
	message: Schema.String,
}) {}

const LIFETIME: { readonly [K in ToastKind]: Duration.Input } = {
	success: "4 seconds",
	info: "8 seconds",
	error: "10 seconds",
};

/**
 * Shows messages, newest last, each dismissing itself after a few seconds.
 * Repeating the message already on screen replaces it rather than stacking.
 *
 * @since 2.1.0
 * @category Services
 */
export class Toasts extends Context.Service<Toasts>()(
	"spotify-pomodoro/client/Toasts",
	{
		make: Effect.gen(function* () {
			const toasts = yield* SubscriptionRef.make<ReadonlyArray<Toast>>([]);
			const nextId = yield* Ref.make(0);
			const scope = yield* Effect.scope;

			const dismiss = (id: number) =>
				SubscriptionRef.update(toasts, (all) => all.filter((t) => t.id !== id));

			const show = Effect.fn("Toasts.show")(function* (
				kind: ToastKind,
				message: string,
			) {
				const id = yield* Ref.getAndUpdate(nextId, (n) => n + 1);
				yield* SubscriptionRef.update(toasts, (all) => [
					...all.filter((t) => t.message !== message).slice(-3),
					new Toast({ id, kind, message }),
				]);
				yield* dismiss(id).pipe(
					Effect.delay(LIFETIME[kind]),
					Effect.forkIn(scope),
				);
			});

			return { toasts, show, dismiss };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
