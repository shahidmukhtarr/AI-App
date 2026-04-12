import { NextResponse } from 'next/server';
import { getReviews } from '../../../server/services/scraperEngine.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ error: 'Search query is required for reviews' }, { status: 400 });
    }

    const reviews = await getReviews(q.trim());
    return NextResponse.json(reviews);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch reviews' }, { status: 500 });
  }
}
