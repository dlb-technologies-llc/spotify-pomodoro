# Spotify Pomodoro

A self-hosted pomodoro timer with Spotify integration and a lofi aesthetic. Focus on your work while your favorite playlists play in the background.

## Features

- Timer presets: Short (15/3), Classic (25/5), Long (50/10)
- Overtime mode - timer counts up after completion, you decide when to switch
- Stop button to end sessions without auto-transitioning to the next phase
- Session statistics with contribution graph - track your focus time, streaks, and overtime
- Spotify integration with playlist selection and Web Playback SDK (play directly in the browser without needing an external Spotify app)
- Structured logging with configurable levels and format (pretty or JSON)
- Light/dark theme toggle
- Keyboard-first controls

## Quick Start with Docker

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the details:
   - **App name:** Spotify Pomodoro
   - **Redirect URI:** See setup options below
   - **APIs used:** Check "Web API" and "Web Playback SDK"
4. Copy the **Client ID** from your app's settings

### 2. Choose Your Setup

#### Option A: Local Development (HTTP)

Spotify allows HTTP only for `localhost` or `127.0.0.1`. Use this for local testing:

```bash
# .env
PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:2500/callback
```

Add `http://127.0.0.1:2500/callback` to your Spotify app's Redirect URIs.

#### Option B: Production with Custom Domain (HTTPS)

For deployment on a server (Coolify, VPS, etc.), you need HTTPS. Set up a domain with SSL:

```bash
# .env
PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
PUBLIC_SPOTIFY_REDIRECT_URI=https://pomodoro.yourdomain.com/callback
```

Add `https://pomodoro.yourdomain.com/callback` to your Spotify app's Redirect URIs.

> **Note:** Spotify requires HTTPS for any redirect URI that isn't `localhost` or `127.0.0.1`. If deploying to a local network IP (e.g., `192.168.x.x`), you must set up SSL via a reverse proxy or use a domain with DNS pointing to your server.

### 3. Run with Docker Compose

```bash
docker compose up -d
```

Open your configured URL in a browser.

### Updating

```bash
docker compose pull
docker compose up -d
```

Your session data persists in the `pomodoro_data` volume.

## Deploy on Coolify

1. Create a new service from this repository
2. Set environment variables in Coolify's UI:
   - `PUBLIC_SPOTIFY_CLIENT_ID`
   - `PUBLIC_SPOTIFY_REDIRECT_URI` (use your Coolify domain: `https://pomodoro.yourdomain.com/callback`)
3. Update your Spotify app's redirect URI to match
4. Deploy

## Authentication (Optional)

For VPS deployments, you can enable authentication to protect your instance:

```bash
# .env
AUTH_ENABLED=true
AUTH_PASSWORD=your-secure-password
AUTH_SECRET=random-32-character-string-for-signing
```

- **Username:** Always `admin` (pre-filled in login form for password manager compatibility)
- **Password:** Your chosen password from `AUTH_PASSWORD`
- **Secret:** Any random string used for signing cookies (keep this secret!)

When enabled, all routes require login. The login page appears at `/login`.

> **Tip:** Generate a secure secret with `openssl rand -base64 32`

## Keyboard Controls

| Key               | Action                       |
| ----------------- | ---------------------------- |
| `Space` / `Enter` | Start timer                  |
| `E`               | End (stop) current session   |
| `B`               | Skip to break (during focus) |
| `F`               | Skip to focus (during break) |
| `R`               | Reset timer (when stopped)   |

The stats dialog uses your browser's time zone for days, weeks, and streaks.

## Local Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

```bash
bun install
bun run dev          # http://127.0.0.1:2500
```

The database (`data/pomodoro.db`) and its migrations are created automatically on the first request.

## Data Persistence

Session data is stored in SQLite (`DATABASE_URL`, default `file:./data/pomodoro.db`). With Docker it lives in the `pomodoro_data` volume; `docker compose down -v` resets it.

## Configuration

| Variable                                 | Default                              | Purpose                                        |
| ---------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| `PUBLIC_SPOTIFY_CLIENT_ID`               | —                                    | Spotify app client ID                          |
| `PUBLIC_SPOTIFY_REDIRECT_URI`            | `http://127.0.0.1:2500/callback`     | OAuth redirect URI registered with Spotify     |
| `AUTH_ENABLED`                           | `false`                              | Require login                                  |
| `AUTH_PASSWORD` / `AUTH_SECRET`          | —                                    | Required when auth is enabled                  |
| `AUTH_COOKIE_MAX_AGE`                    | `604800`                             | Session length in seconds                      |
| `SECURE_COOKIES`                         | `true` in production                 | Mark cookies `Secure`                          |
| `DATABASE_URL`                           | `file:./data/pomodoro.db`            | libSQL URL                                     |
| `OTEL_COLLECTOR_URL`                     | unset                                | OTLP/HTTP collector; tracing is off when unset |
| `LOG_LEVEL` / `LOG_FORMAT`               | `info` / pretty in dev, JSON in prod | Server logging                                 |
| `PUBLIC_LOG_LEVEL` / `PUBLIC_LOG_FORMAT` | same                                 | Browser logging (build time)                   |

Spotify settings are read at runtime by the server, so one image works for any deployment.

## Releases

Every green push to `main` publishes `ghcr.io/dlb-technologies-llc/spotify-pomodoro:latest` (plus `:<version>` and `:sha-<commit>`); Watchtower deployments pick up `:latest`. A version bump in `package.json` also tags and publishes a GitHub release.

## Tech Stack

- **Runtime:** Node 24 in production, Bun for tooling
- **Framework:** Astro 7 (SSR) with React 19 islands
- **Application:** Effect 4 end to end: `HttpApi` server and typed client, Effect SQL on libSQL/SQLite, atoms for UI state, Schema for every data type
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest + `@effect/vitest`, Playwright, live Spotify checks

## Troubleshooting

### "Invalid redirect URI"

Ensure the redirect URI in your Spotify app settings exactly matches `PUBLIC_SPOTIFY_REDIRECT_URI` in your environment.

### "No active device"

The app includes a built-in Web Playback SDK player, so playback works directly in the browser. If you see this error, make sure the browser tab has focus and try refreshing. Alternatively, open Spotify on your computer or phone to use it as the playback device.

### "Spotify session expired, reconnect Spotify"

The refresh token was revoked (for example after removing the app's access in your Spotify account). Click the Spotify button to connect again.

### Container health check failing

Check logs with `docker compose logs`. Ensure port 2500 is not in use by another service, and that `AUTH_PASSWORD` and `AUTH_SECRET` are set when `AUTH_ENABLED=true`.

## License

MIT
