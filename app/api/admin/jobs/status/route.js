import { NextResponse } from 'next/server';
import { getSchedulerStatus } from '../../../../../server/services/scheduler.js';

export async function GET() {
  try {
    return NextResponse.json(getSchedulerStatus());
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Failed to load scheduler status' }, { status: 500 });
  }
}
