// Local end-to-end run (ADR 0032). Wraps Playwright with the disposable
// Postgres: a fresh, empty database each run, so the one-time install flow
// always sees a wiki that has never been installed (ADR 0027). CI does not use
// this script — its Postgres service is already fresh per job.
//
// Passes through any extra arguments (e.g. `pnpm test:e2e --ui`).
import { spawnSync } from "node:child_process";

const COMPOSE = ["compose", "-f", "compose.e2e.yaml"];

function docker(args) {
  return spawnSync("docker", [...COMPOSE, ...args], { stdio: "inherit" });
}

// A leftover container from an interrupted run would keep its (installed)
// database, so start by tearing any down.
docker(["down", "-v"]);
docker(["up", "-d", "--wait"]);

const playwright = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", ...process.argv.slice(2)],
  { stdio: "inherit" }
);

docker(["down", "-v"]);

process.exit(playwright.status ?? 1);
