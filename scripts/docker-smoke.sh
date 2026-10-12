#!/usr/bin/env bash
# Starts the image on a named volume, waits for it to report healthy, records
# a pomodoro, backs up, deletes it, restores the backup into the volume, and
# checks the pomodoro is back.
# Usage: scripts/docker-smoke.sh <image>
set -euo pipefail

image="${1:?usage: docker-smoke.sh <image>}"
name="pomodoro-smoke-$$"
volume="pomodoro-smoke-$$"
port=2599
base="http://127.0.0.1:$port"

cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	docker volume rm -f "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

start() {
	docker run -d --name "$name" -p "$port:2500" -v "$volume:/app/data" "$image" >/dev/null
	local status=starting
	for _ in $(seq 1 60); do
		status=$(docker inspect -f '{{.State.Health.Status}}' "$name")
		[ "$status" = "healthy" ] && return 0
		sleep 1
	done
	docker logs "$name"
	echo "container never became healthy (status: $status)" >&2
	exit 1
}

stop() { docker rm -f "$name" >/dev/null; }

start
curl -fsS "$base/api/health"
curl -fsS "$base/api/ready"
curl -fsSI "$base/" | grep -qi '^content-security-policy:'
curl -fsSI "$base/" | grep -qi '^x-frame-options: DENY'

id=$(curl -fsS -X POST "$base/api/pomodoros" | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -fsS -X POST "$base/api/pomodoros/$id/complete" >/dev/null
curl -fsS "$base/api/stats" | grep -q '"completedPomodoros":1'
curl -fsS -o /dev/null "$base/"

backup=$(curl -fsS -X POST "$base/api/backups" | sed -E 's/.*"file":"([^"]+)".*/\1/')
curl -fsS "$base/api/backups" | grep -q "$backup"
curl -fsS -X DELETE "$base/api/pomodoros/$id" >/dev/null
curl -fsS "$base/api/stats" | grep -q '"totalPomodoros":0'

stop
docker run --rm -v "$volume:/app/data" --entrypoint sh "$image" -c \
	"rm -f /app/data/pomodoro.db-wal /app/data/pomodoro.db-shm && cp /app/data/backups/$backup /app/data/pomodoro.db"
start
curl -fsS "$base/api/stats" | grep -q '"completedPomodoros":1'
curl -fsS "$base/api/history" | grep -q "$id"

echo
echo "smoke test passed for $image (backup $backup restored)"
