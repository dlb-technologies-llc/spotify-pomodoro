/**
 * OAuth initialization endpoint - generates PKCE and returns auth URL.
 *
 * @module
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { APIRoute } from "astro";

const SPOTIFY_CLIENT_ID =
	process.env.PUBLIC_SPOTIFY_CLIENT_ID ||
	import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID ||
	"";
const SPOTIFY_REDIRECT_URI =
	process.env.PUBLIC_SPOTIFY_REDIRECT_URI ||
	import.meta.env.PUBLIC_SPOTIFY_REDIRECT_URI ||
	"";

const SCOPES = [
	"user-read-playback-state",
	"user-modify-playback-state",
	"user-read-currently-playing",
	"playlist-read-private",
	"streaming",
].join(" ");

/**
 * Generates a URL-safe base64 string.
 *
 * @since 1.0.0
 * @category Helpers
 */
function base64UrlEncode(buffer: Buffer): string {
	return buffer.toString("base64url");
}

/**
 * GET /api/auth/init - Initialize OAuth flow with PKCE.
 *
 * Generates code verifier/challenge, stores verifier in session,
 * and returns the Spotify authorization URL.
 *
 * @since 1.0.0
 * @category API
 */
export const GET: APIRoute = async ({ session }) => {
	if (!session) {
		return new Response(JSON.stringify({ error: "Session not available" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	const verifier = base64UrlEncode(randomBytes(32));

	const challenge = base64UrlEncode(
		createHash("sha256").update(verifier).digest(),
	);

	const state = randomUUID();

	session.set("pkce_verifier", verifier);
	session.set("pkce_state", state);

	const params = new URLSearchParams({
		client_id: SPOTIFY_CLIENT_ID,
		response_type: "code",
		redirect_uri: SPOTIFY_REDIRECT_URI,
		scope: SCOPES,
		state,
		code_challenge_method: "S256",
		code_challenge: challenge,
	});

	const authUrl = `https://accounts.spotify.com/authorize?${params}`;

	return new Response(JSON.stringify({ authUrl }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
