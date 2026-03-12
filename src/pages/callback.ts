/**
 * OAuth callback endpoint - exchanges code for tokens.
 *
 * @module
 */
import type { APIRoute } from "astro";

const SPOTIFY_CLIENT_ID =
	process.env.PUBLIC_SPOTIFY_CLIENT_ID ||
	import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID ||
	"";
const SPOTIFY_REDIRECT_URI =
	process.env.PUBLIC_SPOTIFY_REDIRECT_URI ||
	import.meta.env.PUBLIC_SPOTIFY_REDIRECT_URI ||
	"";

/**
 * GET /callback - Handle Spotify OAuth callback.
 *
 * Receives authorization code, retrieves verifier from session,
 * exchanges for tokens, and redirects to home with token in URL fragment.
 *
 * @since 1.0.0
 * @category API
 */
export const GET: APIRoute = async ({ url, session, redirect }) => {
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return redirect(`/?error=${encodeURIComponent(error)}`);
	}

	if (!code || !state) {
		return redirect("/?error=missing_code_or_state");
	}

	if (!session) {
		return redirect("/?error=session_not_available");
	}

	const storedState = await session.get("pkce_state");
	const verifier = (await session.get("pkce_verifier")) as string | undefined;

	if (!storedState || !verifier) {
		return redirect("/?error=session_expired");
	}

	if (state !== storedState) {
		return redirect("/?error=state_mismatch");
	}

	try {
		const tokenResponse = await fetch(
			"https://accounts.spotify.com/api/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: SPOTIFY_REDIRECT_URI,
					client_id: SPOTIFY_CLIENT_ID,
					code_verifier: verifier,
				}),
			},
		);

		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.text();
			console.error("Token exchange failed:", errorData);
			return redirect("/?error=token_exchange_failed");
		}

		const tokenData = (await tokenResponse.json()) as {
			access_token: string;
			refresh_token: string;
			expires_in: number;
			scope: string;
		};

		session.delete("pkce_verifier");
		session.delete("pkce_state");

		const token = {
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token,
			expiresAt: Date.now() + tokenData.expires_in * 1000,
			scope: tokenData.scope,
		};

		const tokenParam = encodeURIComponent(JSON.stringify(token));
		return redirect(`/?token=${tokenParam}`);
	} catch (err) {
		console.error("Callback error:", err);
		return redirect("/?error=callback_failed");
	}
};
