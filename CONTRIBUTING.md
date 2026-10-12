# Contributing

## Setup

```bash
bun install
cp .env.example .env    # add your Spotify client ID
bun run dev
```

Requirements: [Bun](https://bun.sh) 1.3+ and Node 24+ (the production server runs on Node).

## Branches and releases

```
feature/*  ──PR──▶  staging  ──release PR──▶  main
```

1. Branch from `staging`, open a PR into `staging`. CI must be green.
2. Merging into `staging` publishes `ghcr.io/…/spotify-pomodoro:staging`.
3. To release, bump `version` in `package.json`, add a `CHANGELOG.md` entry, and open a PR from `staging` into `main`. CI rejects release PRs from any other branch or with an already-released version.
4. Merging into `main` publishes `:latest` and `:<version>`, tags `v<version>`, and creates the GitHub release from the changelog.

## Checks

| Command             | What it runs                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `bun run check`     | oxlint (type-aware), oxfmt, `astro check`, unit tests             |
| `bun run test`      | Unit and integration tests (Vitest)                               |
| `bun run test:e2e`  | Playwright against a production build (`--project=chromium` etc.) |
| `bun run test:live` | Read-only checks against the real Spotify API                     |

CI runs all of these, plus a Docker build and smoke test, on every PR and push to `staging` and `main`.

### Live Spotify tests

Live tests need a Spotify account's refresh token for the app's client ID. Mint one once and store it as repository secrets:

```bash
bun run spotify:token --github
```

This opens Spotify's consent page, catches the redirect on `PUBLIC_SPOTIFY_REDIRECT_URI`, and sets `SPOTIFY_REFRESH_TOKEN` and `PUBLIC_SPOTIFY_CLIENT_ID`. Locally, export both variables and run `bun run test:live` or `bunx playwright test --project=setup --project=live`.

## Code conventions

- Everything is Effect: services are `Context.Service` classes with a `layer`, functions use `Effect.fn`, errors are `Schema.TaggedError`.
- Every data type comes from an Effect `Schema`. Request bodies are `Schema.Struct`; records are `Model.Class`.
- The API is defined once in `src/shared/api/Api.ts`; the server implements it and the browser derives a typed client from it.
- No `as` casts or `!` assertions.
- Tests use `@effect/vitest`. Test data comes from schemas (`test/support/arbitrary.ts`), not hand-written fixtures.
- JSDoc on exports (`@since`, `@category`); no other comments.
- oxlint lints (type-aware, `.oxlintrc.json`) and oxfmt formats; `bun run lint:fix` applies both.

## Layout

```
src/
  shared/      Schemas, errors, and the HttpApi definition (server + browser)
  server/      HttpApi handlers, services, SQL, migrations
  client/      Browser services (timer, Spotify, recording) and atoms
  components/  React components
  pages/       Astro pages; /api/* and /callback hand off to the Effect server
test/          Vitest: server, client, shared, live
e2e/           Playwright
scripts/       Token minting, Docker smoke test
```

## Database

Migrations live in `src/server/migrations/` and run automatically at startup. Add a new `NNNN_name.ts` file exporting an Effect and register it in `src/server/Database.ts`.
