# Spotify Pomodoro

A Spotify-integrated pomodoro timer app with a lofi aesthetic.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Astro with React (SSR mode with Node adapter)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **State Management**: Effect-TS
- **Database**: SQLite with Drizzle ORM
- **Testing**: Vitest with @effect/vitest
- **Linting/Formatting**: Biome

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run preview` | Preview production build |
| `bun run lint` | Check linting |
| `bun run lint:fix` | Fix linting issues |
| `bun run typecheck` | Run type checking |
| `bun run test` | Run tests once |
| `bun run test:watch` | Run tests in watch mode |
| `bun run db:generate` | Generate database migrations |
| `bun run db:migrate` | Apply database migrations |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:clean` | Delete all session data |
| `bun run docker:dev` | Start dev container (detached, with build) |
| `bun run docker:prod` | Start production container (detached, with build) |
| `bun run docker:down` | Stop containers |
| `bun run docker:logs` | Follow container logs |

## Project Structure

```
src/
├── pages/              # Astro pages and API routes
│   └── api/            # REST API endpoints
├── components/         # React components
│   └── ui/             # shadcn/ui components
├── hooks/              # React hooks (useTimer, useSpotify, useStats)
├── effect/
│   ├── services/       # Effect services (Timer, SessionRepository, etc.)
│   ├── schema/         # Effect Schema definitions
│   └── errors/         # Tagged error types
├── db/                 # Database schema and migrations
├── lib/                # Utility functions and API client
└── styles/             # Global CSS with Tailwind

test/                   # Vitest test files
scripts/                # Utility scripts (db-clean, etc.)
data/                   # SQLite database (gitignored)
```

## Code Conventions

### Comments

**Use JSDoc only.** No inline comments (`//`) or block comments (`/* */`).

```typescript
/**
 * Service description.
 * @since 0.0.1
 * @category Services
 */
export class MyService extends Effect.Service<MyService>()("MyService", {
  // ...
}) {}
```

Required JSDoc tags:
- `@module` at file level
- `@since` version tag on all exports
- `@category` to group related exports (Services, Errors, Schemas, Components, Hooks)

### Effect-TS Services

All services use `Effect.Service` pattern:
- Include `accessors: true` (except config services using `sync`)
- Declare dependencies explicitly in `dependencies` array
- Use `Schema.TaggedError` for error types

### Testing

Use `@effect/vitest` for testing Effect services:

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

describe("MyService", () => {
  it.effect("does something", () =>
    Effect.gen(function* () {
      const result = yield* MyService.doSomething;
      expect(result).toBe(expected);
    }).pipe(Effect.provide(MyService.Default))
  );
});
```

### Imports

- Use `@/` path alias for imports from `src/`
- Group imports: effect libs, third-party, local

### Astro/React

- React components need `client:load` directive in Astro for interactivity
- Keep components focused and composable
- API routes use Astro server endpoints (`src/pages/api/`)

## Environment Variables

Required for Spotify integration:
- `PUBLIC_SPOTIFY_CLIENT_ID` - Spotify app client ID
- `PUBLIC_SPOTIFY_REDIRECT_URI` - OAuth callback URL (must be HTTPS except for localhost/127.0.0.1)

Optional for authentication (VPS deployments):
- `AUTH_ENABLED` - Set to `true` to enable auth (default: false)
- `AUTH_PASSWORD` - Login password (username is always "admin")
- `AUTH_SECRET` - Secret for signing cookies (32+ chars recommended)

Optional for logging:
- `PUBLIC_LOG_LEVEL` - Log level: all, trace, debug, info, warning, error, fatal, none (default: info)
- `PUBLIC_LOG_FORMAT` - Log format: pretty (colorful) or json (structured) (default: pretty in dev)

Optional for observability:
- `OTEL_COLLECTOR_URL` - OpenTelemetry collector endpoint (default: http://localhost:4318)

## OAuth Architecture

Spotify OAuth uses server-side PKCE flow:

1. `/api/auth/init` - Generates PKCE verifier/challenge using Node crypto, stores verifier in Astro session
2. `/callback` - Exchanges authorization code for tokens server-side, returns token via URL redirect

This architecture allows HTTP on localhost/127.0.0.1 (Spotify's exception) while production deployments use HTTPS.

**Why server-side?** Browser's `crypto.subtle` API requires "secure context" (HTTPS or localhost). Server-side PKCE uses Node's crypto module which works regardless of transport security.

## Database

SQLite database stored in `data/pomodoro.db` (gitignored).

Uses `@libsql/client` with Drizzle ORM for cross-runtime compatibility (works in both Node/Vitest and Bun).

**Tables:**
- `pomodoros` - Parent entity for focus/break cycle
- `focus_sessions` - Focus session records
- `break_sessions` - Break session records

**Workflow:**
1. Modify schema in `src/db/schema.ts`
2. Run `bun run db:generate` to create migration
3. Run `bun run db:migrate` to apply migration

## Notes

- Biome is configured to skip Tailwind CSS files (global.css)
- Timer uses countdown then overtime behavior (counts up after hitting zero)
- Spotify playback requires an active device
- Session recording happens automatically on phase transitions
- Docker deployment uses named volume `pomodoro_data` for SQLite persistence
