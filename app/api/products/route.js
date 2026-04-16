import { NextResponse } from 'next/server';
import { queryStoredProducts } from '../../../server/services/db.js';
import { searchAllStores, scrapeRelevantCategoryPages } from '../../../server/services/scraperEngine.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const store = url.searchParams.get('store') || '';
    const sort = url.searchParams.get('sort') || 'created-desc';
    const limit = Number(url.searchParams.get('limit') || 100);
    const page = Number(url.searchParams.get('page') || 1);

    const trimmedQuery = q.trim();

    // Step 1: Query what we already have in the DB
    const data = await queryStoredProducts({ q, store, sort, limit: Math.min(limit, 200), page });

    // Step 2: If we have fewer than 10 results, tell the frontend to trigger a live background scrape
    const needsLiveScrape = trimmedQuery.length >= 2 && (data.products?.length ?? 0) < 10;
    data.needsLiveScrape = needsLiveScrape;

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch products' }, { status: 500 });
  }
}
