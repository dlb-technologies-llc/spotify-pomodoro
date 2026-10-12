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
	SchemaTransformation,
} from "effect";
import { AUTH_USERNAME, UserName } from "@/shared/domain/Auth";

/**
 * A user allowed to log in.
 *
 * @since 2.1.0
 * @category Models
 */
export class AuthUser extends Schema.Class<AuthUser>("AuthUser")({
	name: UserName,
	password: Schema.RedactedFromValue(Schema.NonEmptyString),
}) {}

/**
 * `AUTH_USERS`: comma-separated `name:password` pairs. A password may
 * contain `:` but not `,`.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const AuthUsersFromString = Schema.String.pipe(
	Schema.decodeTo(
		Schema.Array(AuthUser).check(Schema.isMinLength(1)),
		SchemaTransformation.transform<
			ReadonlyArray<typeof AuthUser.Encoded>,
			string
		>({
			decode: (list) =>
				list
					.split(",")
					.map((entry) => entry.trim())
					.filter((entry) => entry.length > 0)
					.map((entry) => {
						const at = entry.indexOf(":");
						return at === -1
							? { name: entry, password: "" }
							: { name: entry.slice(0, at), password: entry.slice(at + 1) };
					}),
			encode: (users) =>
				users.map((user) => `${user.name}:${user.password}`).join(","),
		}),
	),
);

/**
 * Settings for password login, present only when `AUTH_ENABLED=true`.
 *
 * @since 2.0.0
 * @category Models
 */
export class AuthSettings extends Schema.Class<AuthSettings>("AuthSettings")({
	users: Schema.Array(AuthUser),
	secret: Schema.Redacted(Schema.String),
	maxAgeSeconds: Schema.Int,
}) {}

const authSettings = Config.Boolean("AUTH_ENABLED").pipe(
	Config.withDefault(false),
	Config.flatMap((enabled) =>
		enabled
			? Config.all({
					users: Config.schema(AuthUsersFromString, "AUTH_USERS").pipe(
						Config.orElse(() =>
							Config.Redacted("AUTH_PASSWORD").pipe(
								Config.map((password) => [
									new AuthUser({ name: AUTH_USERNAME, password }),
								]),
							),
						),
					),
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
 * Fails at startup when `AUTH_ENABLED=true` and the secret, or both
 * `AUTH_USERS` and `AUTH_PASSWORD`, are missing.
 *
 * @since 2.0.0
 * @category Services
 */
export class ServerConfig extends Context.Service<ServerConfig>()(
	"spotify-pomodoro/server/ServerConfig",
	{
		make: Config.all({
			auth: authSettings,
			trustProxy: Config.Boolean("TRUST_PROXY").pipe(Config.withDefault(false)),
			maxLoginAttempts: Config.Int("AUTH_MAX_ATTEMPTS").pipe(
				Config.withDefault(5),
			),
			lockoutSeconds: Config.Int("AUTH_LOCKOUT_SECONDS").pipe(
				Config.withDefault(15 * 60),
			),
			backupDir: Config.String("BACKUP_DIR").pipe(Config.option),
			backupRetentionDays: Config.Int("BACKUP_RETENTION_DAYS").pipe(
				Config.withDefault(7),
			),
			backupIntervalHours: Config.Int("BACKUP_INTERVAL_HOURS").pipe(
				Config.withDefault(24),
			),
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
