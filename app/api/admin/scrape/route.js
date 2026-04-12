import { NextResponse } from 'next/server';
import { searchAllStores } from '../../../../../server/services/scraperEngine.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const q = body?.q?.trim();
    const limit = Number(body?.limit || 12);

    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Scrape query is required and must be at least 2 characters.' }, { status: 400 });
    }

    const results = await searchAllStores(q, limit);
    return NextResponse.json({ success: true, scraped: results.products?.length || 0, ...results });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Scraper job failed' }, { status: 500 });
  }
}
