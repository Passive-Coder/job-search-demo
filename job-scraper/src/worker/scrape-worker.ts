import { config as loadEnv } from "dotenv";

import { runScrapeCycle } from "../lib/jobs/service";

loadEnv({ path: ".env.local" });
loadEnv();

const intervalMs = Number(process.env.SCRAPE_INTERVAL_MS ?? 10000);
let isRunning = false;
let timer: NodeJS.Timeout | null = null;

function scheduleNextRun() {
  timer = setTimeout(() => {
    void executeCycle();
  }, intervalMs);
}

async function executeCycle() {
  if (isRunning) {
    scheduleNextRun();
    return;
  }

  isRunning = true;

  try {
    const summary = await runScrapeCycle();
    const breakdown = Object.entries(summary.sources)
      .map(([provider, count]) => `${provider}:${count}`)
      .join(" ");

    console.log(
      `[worker] synced ${summary.upserted} jobs in ${summary.durationMs}ms | fetched=${summary.fetched} deduped=${summary.deduped} | ${breakdown}`,
    );

    if (summary.errors.length > 0) {
      console.log(`[worker] non-fatal source errors: ${summary.errors.join(" | ")}`);
    }
  } catch (error) {
    console.error(
      `[worker] scrape cycle failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

process.on("SIGINT", () => {
  if (timer) {
    clearTimeout(timer);
  }

  process.exit(0);
});

process.on("SIGTERM", () => {
  if (timer) {
    clearTimeout(timer);
  }

  process.exit(0);
});

void executeCycle();
