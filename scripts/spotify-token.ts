/**
 * Mints a Spotify refresh token for the live tests.
 *
 * Opens the consent flow with the app's client ID and redirect URI, catches
 * the callback on the redirect URI's port, and prints the refresh token.
 * With `--github`, also stores `SPOTIFY_REFRESH_TOKEN` and
 * `PUBLIC_SPOTIFY_CLIENT_ID` as repository secrets via `gh`.
 *
 * Usage: `bun run spotify:token [--github]`
 *
 * @module
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Config, Deferred, Effect, Schema } from "effect";
import { SPOTIFY_SCOPES, SpotifyTokenResponse } from "@/shared/domain/Spotify";

const program = Effect.gen(function* () {
	const clientId = yield* Config.String("PUBLIC_SPOTIFY_CLIENT_ID");
	const redirectUri = new URL(
		yield* Config.String("PUBLIC_SPOTIFY_REDIRECT_URI").pipe(
			Config.withDefault("http://127.0.0.1:2500/callback"),
		),
	);
	const verifier = randomBytes(32).toString("base64url");
	const state = randomUUID();
	const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
	authorizeUrl.search = new URLSearchParams({
		client_id: clientId,
		response_type: "code",
		redirect_uri: redirectUri.toString(),
		scope: SPOTIFY_SCOPES.join(" "),
		state,
		code_challenge_method: "S256",
		code_challenge: createHash("sha256").update(verifier).digest("base64url"),
	}).toString();

	const code = yield* Deferred.make<string, Error>();
	yield* Effect.acquireRelease(
		Effect.sync(() =>
			createServer((request, response) => {
				const url = new URL(request.url ?? "/", redirectUri);
				if (url.pathname !== redirectUri.pathname) {
					response.writeHead(404).end("Not found");
					return;
				}
				const received = url.searchParams.get("code");
				if (url.searchParams.get("state") !== state || !received) {
					Deferred.doneUnsafe(
						code,
						Effect.fail(
							new Error(url.searchParams.get("error") ?? "state mismatch"),
						),
					);
					response.end("Authorization failed, see the terminal.");
					return;
				}
				Deferred.doneUnsafe(code, Effect.succeed(received));
				response.end("Authorized. You can close this tab.");
			}).listen(Number(redirectUri.port || 80), redirectUri.hostname),
		),
		(server) => Effect.sync(() => server.close()),
	);

	yield* Effect.log(
		`Stop any dev server on ${redirectUri.host}, then open:\n\n${authorizeUrl}\n`,
	);
	const authorizationCode = yield* Deferred.await(code);

	const response = yield* Effect.promise(() =>
		fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: authorizationCode,
				redirect_uri: redirectUri.toString(),
				client_id: clientId,
				code_verifier: verifier,
			}),
		}),
	);
	const token = yield* Effect.promise(() => response.json()).pipe(
		Effect.flatMap(Schema.decodeUnknownEffect(SpotifyTokenResponse)),
	);
	const refreshToken = token.refresh_token;
	if (!refreshToken) {
		return yield* Effect.fail(new Error("Spotify returned no refresh token"));
	}

	if (process.argv.includes("--github")) {
		yield* Effect.try(() => {
			execFileSync(
				"gh",
				["secret", "set", "SPOTIFY_REFRESH_TOKEN", "--body", refreshToken],
				{ stdio: "inherit" },
			);
			execFileSync(
				"gh",
				["secret", "set", "PUBLIC_SPOTIFY_CLIENT_ID", "--body", clientId],
				{ stdio: "inherit" },
			);
		});
		yield* Effect.log(
			"Stored SPOTIFY_REFRESH_TOKEN and PUBLIC_SPOTIFY_CLIENT_ID as repository secrets.",
		);
	}
	yield* Effect.log(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
});

Effect.runPromise(Effect.scoped(program)).catch((error) => {
	console.error(error);
	process.exit(1);
});
