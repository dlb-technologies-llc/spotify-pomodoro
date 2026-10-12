/**
 * Server configuration read from the environment.
 *
 * @module
 */
import {
	Config,
	ConfigProvider,
	Context,
	Effect,
	Layer,
	Option,
	Predicate,
	Schema,
} from "effect";

/**
 * Settings for password login, present only when `AUTH_ENABLED=true`.
 *
 * @since 2.0.0
 * @category Models
 */
export class AuthSettings extends Schema.Class<AuthSettings>("AuthSettings")({
	password: Schema.Redacted(Schema.String),
	secret: Schema.Redacted(Schema.String),
	maxAgeSeconds: Schema.Int,
}) {}

const authSettings = Config.Boolean("AUTH_ENABLED").pipe(
	Config.withDefault(false),
	Config.flatMap((enabled) =>
		enabled
			? Config.all({
					password: Config.Redacted("AUTH_PASSWORD"),
					secret: Config.Redacted("AUTH_SECRET"),
					maxAgeSeconds: Config.Int("AUTH_COOKIE_MAX_AGE").pipe(
						Config.withDefault(7 * 24 * 60 * 60),
					),
				}).pipe(
					Config.map((settings) => Option.some(new AuthSettings(settings))),
				)
			: Config.succeed(Option.none<AuthSettings>()),
	),
);

/**
 * Environment-derived server settings.
 *
 * Fails at startup when `AUTH_ENABLED=true` and the password or secret is
 * missing.
 *
 * @since 2.0.0
 * @category Services
 */
export class ServerConfig extends Context.Service<ServerConfig>()(
	"spotify-pomodoro/server/ServerConfig",
	{
		make: Config.all({
			auth: authSettings,
			secureCookies: Config.Boolean("SECURE_COOKIES").pipe(
				Config.withDefault(import.meta.env.PROD),
			),
			spotifyClientId: Config.String("PUBLIC_SPOTIFY_CLIENT_ID").pipe(
				Config.withDefault(""),
			),
			spotifyRedirectUri: Config.String("PUBLIC_SPOTIFY_REDIRECT_URI").pipe(
				Config.withDefault("http://127.0.0.1:2500/callback"),
			),
			databaseUrl: Config.String("DATABASE_URL").pipe(
				Config.withDefault("file:./data/pomodoro.db"),
			),
			otelCollectorUrl: Config.String("OTEL_COLLECTOR_URL").pipe(Config.option),
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}

/**
 * Reads configuration from `process.env`, falling back to the values Vite
 * loaded from `.env` files in development.
 *
 * @since 2.0.0
 * @category Layers
 */
export const EnvConfigProvider = Layer.unwrap(
	Effect.sync(() => {
		const env: Record<string, string> = {};
		for (const source of [import.meta.env, process.env]) {
			for (const [key, value] of Object.entries(source)) {
				if (Predicate.isString(value)) env[key] = value;
			}
		}
		return ConfigProvider.layer(ConfigProvider.fromEnv({ env }));
	}),
);
