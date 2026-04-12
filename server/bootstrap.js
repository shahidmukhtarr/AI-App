import { initDb } from './services/db.js';
import { startScheduler } from './services/scheduler.js';

initDb().catch(err => {
  console.error('[Bootstrap] Supabase initialization failed:', err.message);
});

if (!process.env.VERCEL) {
  startScheduler();
} else {
  console.log('[Bootstrap] Scheduler disabled in Vercel environment.');
}
