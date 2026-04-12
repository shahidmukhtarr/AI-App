import { NextResponse } from 'next/server';
import { searchAllStores } from '../../../server/services/scraperEngine.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const limit = Number(url.searchParams.get('limit') || 8);

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 });
    }

    const results = await searchAllStores(q.trim(), limit);
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Search failed' }, { status: 500 });
  }
}
