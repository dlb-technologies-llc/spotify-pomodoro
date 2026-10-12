#!/usr/bin/env bash
# Starts the image, waits for it to report healthy, and records a pomodoro.
# Usage: scripts/docker-smoke.sh <image>
set -euo pipefail

image="${1:?usage: docker-smoke.sh <image>}"
name="pomodoro-smoke-$$"
port=2599

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -p "$port:2500" "$image" >/dev/null

for _ in $(seq 1 60); do
	status=$(docker inspect -f '{{.State.Health.Status}}' "$name")
	[ "$status" = "healthy" ] && break
	sleep 1
done
if [ "$status" != "healthy" ]; then
	docker logs "$name"
	echo "container never became healthy (status: $status)" >&2
	exit 1
fi

base="http://127.0.0.1:$port"
curl -fsS "$base/api/health"
id=$(curl -fsS -X POST "$base/api/pomodoros" | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -fsS -X POST "$base/api/pomodoros/$id/complete" >/dev/null
curl -fsS "$base/api/stats" | grep -q '"completedPomodoros":1'
curl -fsS -o /dev/null "$base/"
echo
echo "smoke test passed for $image"
