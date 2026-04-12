import { NextResponse } from 'next/server';
import { queryStoredProducts } from '../../../server/services/db.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const store = url.searchParams.get('store') || '';
    const sort = url.searchParams.get('sort') || 'created-desc';
    const limit = Number(url.searchParams.get('limit') || 50);
    const page = Number(url.searchParams.get('page') || 1);

    const data = await queryStoredProducts({ q, store, sort, limit, page });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch products' }, { status: 500 });
  }
}
