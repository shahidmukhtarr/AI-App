import { searchAllStores, scrapeAllCategoryLinks } from './scraperEngine.js';
import { delay } from '../utils/helpers.js';

const defaultQueries = [
  'iPhone 15',
  'Samsung Galaxy S24',
  'MacBook Air',
  'AirPods Pro',
  'PlayStation 5',
  'Smartwatch',
  'Power bank',
  'Gaming laptop',
  'Wireless headphones',
  'Canon DSLR'
];

const QUERY_CSV = process.env.SCRAPER_QUERIES || defaultQueries.join(',');
const JOB_QUERIES = QUERY_CSV.split(',').map(q => q.trim()).filter(Boolean);
const INTERVAL_MINUTES = parseInt(process.env.SCRAPER_INTERVAL_MINUTES, 10) || 240;
const INTERVAL_MS = Math.max(INTERVAL_MINUTES, 1) * 60 * 1000;

let lastRun = null;
let nextRun = null;
let isRunning = false;
let intervalId = null;
let lastRunResult = null;

export function getSchedulerStatus() {
  return {
    isRunning,
    lastRun: lastRun ? lastRun.toISOString() : null,
    nextRun: nextRun ? nextRun.toISOString() : null,
    intervalMinutes: INTERVAL_MINUTES,
    queries: JOB_QUERIES,
    lastRunResult,
  };
}

let runCount = 0;

async function runQueryList() {
  const results = [];
  runCount++;

  for (const query of JOB_QUERIES) {
    try {
      const result = await searchAllStores(query, 10);
      const scrapedCount = result.products?.length ?? 0;
      const savedCount = result.savedCount ?? 0;
      const updatedCount = result.updatedCount ?? 0;

      console.log(`[Scheduler] Query "${query}" completed: scraped=${scrapedCount}, saved=${savedCount}, updated=${updatedCount}, stores=${result.storesSearched?.join(', ') || 'none'}`);

      results.push({
        query,
        scraped: scrapedCount,
        saved: savedCount,
        updated: updatedCount,
        stores: result.storesSearched,
        errors: result.storeErrors,
      });
    } catch (err) {
      console.log(`[Scheduler] Query "${query}" failed: ${err.message}`);
      results.push({ query, error: err.message });
    }

    // Pause between query runs to avoid bursts
    await delay(3000);
  }

  // Every 5 scheduler runs, also do a full category seed to keep DB fresh
  const seedEvery = parseInt(process.env.SCRAPER_SEED_CATEGORIES_EVERY, 10) || 5;
  if (runCount % seedEvery === 0 || runCount === 1) {
    console.log(`[Scheduler] Run #${runCount}: Triggering full category seed (every ${seedEvery} runs)`);
    try {
      const seedResult = await scrapeAllCategoryLinks({ limitPerCategory: 20 });
      console.log(`[Scheduler] Category seed done: ${seedResult.successCount}/${seedResult.total} categories, ${seedResult.totalSaved} new products`);
      results.push({ type: 'category_seed', successCount: seedResult.successCount, totalSaved: seedResult.totalSaved });
    } catch (err) {
      console.log(`[Scheduler] Category seed failed: ${err.message}`);
    }
  }

  return results;
}

export async function runBackgroundScrape() {
  if (isRunning) {
    return { status: 'already_running', message: 'Background scrape already in progress' };
  }

  console.log('[Scheduler] Background scrape started');

  isRunning = true;
  lastRun = new Date();
  nextRun = new Date(lastRun.getTime() + INTERVAL_MS);

  try {
    const results = await runQueryList();
    const totalScraped = results.reduce((sum, item) => sum + (item.scraped || 0), 0);
    const totalSaved = results.reduce((sum, item) => sum + (item.saved || 0), 0);
    const totalUpdated = results.reduce((sum, item) => sum + (item.updated || 0), 0);

    const runResult = {
      status: 'completed',
      results,
      totalScraped,
      totalSaved,
      totalUpdated,
      timestamp: new Date().toISOString(),
    };

    lastRunResult = runResult;

    console.log(`[Scheduler] Background scrape finished: totalQueries=${results.length}, totalScraped=${totalScraped}, totalSaved=${totalSaved}, totalUpdated=${totalUpdated}`);

    return {
      ...runResult,
      lastRun: lastRun.toISOString(),
      nextRun: nextRun.toISOString(),
    };
  } catch (err) {
    const runResult = {
      status: 'failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    };

    lastRunResult = runResult;

    console.log(`[Scheduler] Background scrape failed: ${err.message}`);
    return {
      ...runResult,
      lastRun: lastRun.toISOString(),
      nextRun: nextRun.toISOString(),
    };
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  if (intervalId) return;
  // Prevent duplicate schedulers in Next.js dev mode (layout compiles per-page)
  if (globalThis.__schedulerStarted) return;
  globalThis.__schedulerStarted = true;

  nextRun = new Date(Date.now() + INTERVAL_MS);
  console.log(`[Scheduler] Scheduler will run every ${INTERVAL_MINUTES} minutes. Next run at ${nextRun.toISOString()}`);

  intervalId = setInterval(async () => {
    console.log(`[Scheduler] Scheduled scrape triggered at ${new Date().toISOString()}`);
    await runBackgroundScrape();
  }, INTERVAL_MS);

  if (process.env.SCRAPER_RUN_ON_START === 'true') {
    console.log('[Scheduler] Running initial scrape on startup because SCRAPER_RUN_ON_START=true');
    runBackgroundScrape().catch(err => console.error('[Scheduler] Initial run failed:', err.message));
  }
}
