import { NextResponse } from 'next/server';
import { runBackgroundScrape } from '../../../../../server/services/scheduler.js';

export async function POST() {
  try {
    const result = await runBackgroundScrape();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Scheduler run failed' }, { status: 500 });
  }
}
