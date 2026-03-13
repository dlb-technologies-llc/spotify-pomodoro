/**
 * Effect logging configuration with environment-based log levels.
 *
 * @module
 */

import { Layer, Logger, type LogLevel, References } from "effect";

/**
 * Parse LOG_LEVEL environment variable to Effect LogLevel.
 *
 * @since 1.4.0
 * @category Logging
 */
const parseLogLevel = (level: string | undefined): LogLevel.LogLevel => {
	const normalized = level?.toLowerCase();
	switch (normalized) {
		case "all":
			return "All";
		case "trace":
			return "Trace";
		case "debug":
			return "Debug";
		case "info":
			return "Info";
		case "warning":
		case "warn":
			return "Warn";
		case "error":
			return "Error";
		case "fatal":
			return "Fatal";
		case "none":
		case "off":
			return "None";
		default:
			return "Info";
	}
};

/**
 * Determine if we should use pretty logger based on environment.
 *
 * @since 1.4.0
 * @category Logging
 */
const shouldUsePrettyLogger = (): boolean => {
	const logFormat = (
		import.meta.env.PUBLIC_LOG_FORMAT || process.env.LOG_FORMAT
	)?.toLowerCase();
	if (logFormat === "json") return false;
	if (logFormat === "pretty") return true;

	return import.meta.env.DEV ?? true;
};

/**
 * Get the current log level from environment.
 *
 * @since 1.4.0
 * @category Logging
 */
const getLogLevel = (): LogLevel.LogLevel => {
	const envLevel = import.meta.env.PUBLIC_LOG_LEVEL || process.env.LOG_LEVEL;
	return parseLogLevel(envLevel);
};

/**
 * Logger layer that configures format based on environment.
 *
 * Uses pretty logger in development and JSON logger in production.
 *
 * @since 1.4.0
 * @category Layers
 */
export const LoggerFormatLayer: Layer.Layer<never> = shouldUsePrettyLogger()
	? Logger.layer([Logger.consolePretty()])
	: Logger.layer([Logger.consoleJson]);

/**
 * Minimum log level layer based on LOG_LEVEL environment variable.
 *
 * @since 1.4.0
 * @category Layers
 */
export const LogLevelLayer: Layer.Layer<never> = Layer.succeed(
	References.MinimumLogLevel,
	getLogLevel(),
);

/**
 * Combined logging configuration layer.
 *
 * Applies both logger format and minimum log level.
 *
 * @since 1.4.0
 * @category Layers
 */
export const LoggingLayer: Layer.Layer<never> = Layer.mergeAll(
	LoggerFormatLayer,
	LogLevelLayer,
);
