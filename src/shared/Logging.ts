/**
 * Logger format and minimum level, shared by server and browser.
 *
 * @module
 */
import { Layer, Logger, type LogLevel, References, Schema } from "effect";

/**
 * Accepted `PUBLIC_LOG_LEVEL` values, case-insensitive.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const LogLevelName = Schema.Literals([
	"all",
	"trace",
	"debug",
	"info",
	"warn",
	"warning",
	"error",
	"fatal",
	"none",
	"off",
]);

const LEVELS: Record<typeof LogLevelName.Type, LogLevel.LogLevel> = {
	all: "All",
	trace: "Trace",
	debug: "Debug",
	info: "Info",
	warn: "Warn",
	warning: "Warn",
	error: "Error",
	fatal: "Fatal",
	none: "None",
	off: "None",
};

const isLogLevelName = Schema.is(LogLevelName);

/**
 * Parses a level name, defaulting to `Info`.
 *
 * @since 1.4.0
 * @category Logging
 */
export const parseLogLevel = (value: string | undefined): LogLevel.LogLevel => {
	const normalized = value?.toLowerCase();
	return isLogLevelName(normalized) ? LEVELS[normalized] : "Info";
};

/**
 * Logging layer: pretty or JSON output, filtered to a minimum level.
 *
 * `format` is `"pretty"` or `"json"`; anything else picks pretty in
 * development and JSON in production.
 *
 * @since 2.0.0
 * @category Layers
 */
export const loggingLayer = (options: {
	readonly level: string | undefined;
	readonly format: string | undefined;
}) => {
	const format = options.format?.toLowerCase();
	const pretty =
		format === "pretty" || (format !== "json" && import.meta.env.DEV);
	return Layer.mergeAll(
		Logger.layer([pretty ? Logger.consolePretty() : Logger.consoleJson]),
		Layer.succeed(References.MinimumLogLevel, parseLogLevel(options.level)),
	);
};
