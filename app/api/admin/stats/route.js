import { NextResponse } from 'next/server';
import { getDbStats } from '../../../../../server/services/db.js';

export async function GET() {
  try {
    const stats = await getDbStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch admin stats' }, { status: 500 });
  }
}
