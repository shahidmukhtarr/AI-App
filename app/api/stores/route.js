import { NextResponse } from 'next/server';
import { getSupportedStores } from '../../../server/services/scraperEngine.js';

export async function GET() {
  try {
    const stores = getSupportedStores();
    return NextResponse.json({ stores, total: stores.length });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Failed to load stores' }, { status: 500 });
  }
}
