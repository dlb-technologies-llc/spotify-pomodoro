/**
 * Timer-related errors.
 *
 * @module
 */

import { Schema } from "effect";

/**
 * Error from timer operations.
 *
 * @since 0.0.1
 * @category Errors
 */
export class TimerError extends Schema.TaggedErrorClass<TimerError>()(
	"TimerError",
	{
		reason: Schema.Literals(["InvalidDuration", "InvalidState"]),
		message: Schema.String,
	},
) {}
