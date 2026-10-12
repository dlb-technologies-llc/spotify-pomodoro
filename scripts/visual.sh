#!/usr/bin/env bash
# Runs the visual regression tests in the same Playwright image CI uses, so
# screenshots match. Extra arguments go to Playwright, e.g.
# `scripts/visual.sh --update-snapshots`.
set -euo pipefail

version=$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^\D*/, '')")
bun_version=$(node -p "require('./package.json').packageManager.split('@')[1]")
image="mcr.microsoft.com/playwright:v${version}-noble"

docker run --rm --ipc=host \
	-v "$PWD:/src" \
	-e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
	-e BUN_VERSION="$bun_version" \
	"$image" bash -c '
		set -euo pipefail
		mkdir -p /work && cd /src
		tar cf - --exclude=./node_modules --exclude=./dist --exclude=./data --exclude=./.env \
			--exclude=./test-results --exclude=./playwright-report . | tar xf - -C /work
		cd /work
		npm install --silent --prefix /tmp/tools "bun@$BUN_VERSION"
		export PATH="/tmp/tools/node_modules/.bin:$PATH"
		bun install --frozen-lockfile >/dev/null
		status=0
		bunx playwright test --project=setup --project=visual "$@" || status=$?
		mkdir -p /src/e2e/visual.spec.ts-snapshots
		cp -r e2e/visual.spec.ts-snapshots/. /src/e2e/visual.spec.ts-snapshots/ 2>/dev/null || true
		if [ -d test-results ]; then rm -rf /src/test-results && cp -r test-results /src/; fi
		chown -R "$HOST_UID:$HOST_GID" /src/e2e/visual.spec.ts-snapshots /src/test-results 2>/dev/null || true
		exit $status
	' bash "$@"
