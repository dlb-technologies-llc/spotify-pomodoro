/**
 * The HTTP API, shared by the server implementation and the typed browser
 * client.
 *
 * @module
 */
import { Schema } from "effect";
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiMiddleware,
	HttpApiSchema,
	HttpApiSecurity,
} from "effect/http-api";
import {
	AUTH_COOKIE,
	AuthDisabled,
	InvalidCredentials,
	LoginRequest,
	Unauthorized,
} from "../domain/Auth";
import {
	BreakSession,
	BreakSessionId,
	BreakSessionNotFound,
	CompleteSession,
	FocusSession,
	FocusSessionId,
	FocusSessionNotFound,
	Pomodoro,
	PomodoroId,
	PomodoroNotFound,
	StartSession,
} from "../domain/Session";
import {
	RefreshTokenRequest,
	SpotifyNotConnected,
	SpotifyToken,
	SpotifyUnavailable,
} from "../domain/Spotify";
import { SessionStats, StatsQuery } from "../domain/Stats";

/**
 * Session cookie security scheme.
 *
 * @since 2.0.0
 * @category Security
 */
export const sessionCookie = HttpApiSecurity.apiKey({
	key: AUTH_COOKIE,
	in: "cookie",
});

/**
 * Rejects requests without a valid session cookie when auth is enabled.
 *
 * @since 2.0.0
 * @category Middleware
 */
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
	"spotify-pomodoro/Authorization",
	{
		security: { cookie: sessionCookie },
		error: Unauthorized,
	},
) {}

/**
 * Health check response.
 *
 * @since 2.0.0
 * @category Schemas
 */
export class Health extends Schema.Class<Health>("Health")({
	status: Schema.Literal("ok"),
}) {}

/**
 * Liveness probe.
 *
 * @since 2.0.0
 * @category Groups
 */
export class SystemApi extends HttpApiGroup.make("system", {
	topLevel: true,
}).add(
	HttpApiEndpoint.get("health", "/api/health", {
		success: Health,
	}),
) {}

/**
 * Password login for protected deployments.
 *
 * @since 2.0.0
 * @category Groups
 */
export class AuthApi extends HttpApiGroup.make("auth")
	.add(
		HttpApiEndpoint.post("login", "/login", {
			payload: LoginRequest,
			error: [InvalidCredentials, AuthDisabled],
		}),
		HttpApiEndpoint.post("logout", "/logout"),
	)
	.prefix("/api/auth") {}

/**
 * Spotify OAuth (authorization code with PKCE) and token refresh.
 *
 * @since 2.0.0
 * @category Groups
 */
export class SpotifyApi extends HttpApiGroup.make("spotify")
	.add(
		HttpApiEndpoint.get("authorize", "/api/spotify/authorize"),
		HttpApiEndpoint.get("callback", "/callback", {
			query: {
				code: Schema.optional(Schema.String),
				state: Schema.optional(Schema.String),
				error: Schema.optional(Schema.String),
			},
		}),
		HttpApiEndpoint.post("refresh", "/api/spotify/refresh", {
			payload: RefreshTokenRequest,
			success: SpotifyToken,
			error: [SpotifyNotConnected, SpotifyUnavailable],
		}),
	)
	.middleware(Authorization) {}

/**
 * Recording pomodoros and their sessions, and reading statistics.
 *
 * @since 2.0.0
 * @category Groups
 */
export class SessionsApi extends HttpApiGroup.make("sessions")
	.add(
		HttpApiEndpoint.post("createPomodoro", "/pomodoros", {
			success: Pomodoro.json.pipe(HttpApiSchema.status(201)),
		}),
		HttpApiEndpoint.post("completePomodoro", "/pomodoros/:id/complete", {
			params: { id: PomodoroId },
			success: Pomodoro.json,
			error: PomodoroNotFound,
		}),
		HttpApiEndpoint.post("startFocus", "/focus-sessions", {
			payload: StartSession,
			success: FocusSession.json.pipe(HttpApiSchema.status(201)),
			error: PomodoroNotFound,
		}),
		HttpApiEndpoint.post("completeFocus", "/focus-sessions/:id/complete", {
			params: { id: FocusSessionId },
			payload: CompleteSession,
			success: FocusSession.json,
			error: FocusSessionNotFound,
		}),
		HttpApiEndpoint.post("startBreak", "/break-sessions", {
			payload: StartSession,
			success: BreakSession.json.pipe(HttpApiSchema.status(201)),
			error: PomodoroNotFound,
		}),
		HttpApiEndpoint.post("completeBreak", "/break-sessions/:id/complete", {
			params: { id: BreakSessionId },
			payload: CompleteSession,
			success: BreakSession.json,
			error: BreakSessionNotFound,
		}),
		HttpApiEndpoint.get("stats", "/stats", {
			query: StatsQuery,
			success: SessionStats,
		}),
	)
	.middleware(Authorization)
	.prefix("/api") {}

/**
 * OTLP/JSON trace export request, as sent by the browser tracer.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const TraceExport = Schema.Struct({
	resourceSpans: Schema.Array(Schema.Unknown),
});

/**
 * Relays browser traces to the OpenTelemetry collector.
 *
 * @since 2.0.0
 * @category Groups
 */
export class TelemetryApi extends HttpApiGroup.make("telemetry")
	.add(
		HttpApiEndpoint.post("traces", "/traces", {
			payload: TraceExport,
			success: HttpApiSchema.Accepted,
		}),
	)
	.middleware(Authorization)
	.prefix("/api/telemetry") {}

/**
 * The full API.
 *
 * @since 2.0.0
 * @category Api
 */
export class Api extends HttpApi.make("spotify-pomodoro")
	.add(SystemApi)
	.add(AuthApi)
	.add(SpotifyApi)
	.add(SessionsApi)
	.add(TelemetryApi) {}
