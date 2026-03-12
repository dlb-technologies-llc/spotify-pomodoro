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

| Key               | Action                              |
| ----------------- | ----------------------------------- |
| `Space` / `Enter` | Start timer                         |
| `E`               | End (stop) current session          |
| `B`               | Skip to break (during focus)        |
| `F`               | Skip to focus (during break)        |
| `R`               | Reset timer (when stopped)          |

## Local Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup.

```bash
# Without Docker
bun install
bun run db:migrate
bun run dev

# With Docker
docker compose -f docker-compose.dev.yml up
```

## Data Persistence

Session data is stored in SQLite. When using Docker, data persists in the `pomodoro_data` volume.

To reset your data:

```bash
# Docker
docker compose down -v
docker compose up -d

# Local
bun run db:clean
```

## Tech Stack

- **Runtime:** Bun
- **Framework:** Astro with React (SSR)
- **Database:** SQLite with Drizzle ORM
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **State Management:** Effect-TS

## Troubleshooting

### "Invalid redirect URI"

Ensure the redirect URI in your Spotify app settings exactly matches `PUBLIC_SPOTIFY_REDIRECT_URI` in your environment.

### "No active device"

The app includes a built-in Web Playback SDK player, so playback works directly in the browser. If you see this error, make sure the browser tab has focus and try refreshing. Alternatively, open Spotify on your computer or phone to use it as the playback device.

### Container health check failing

Check logs with `docker compose logs`. Ensure port 2500 is not in use by another service.

## License

MIT
