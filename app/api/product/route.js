import { NextResponse } from 'next/server';
import { getProductFromUrl } from '../../../server/services/scraperEngine.js';
import { isValidUrl } from '../../../server/utils/helpers.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const productUrl = url.searchParams.get('url');

    if (!productUrl) {
      return NextResponse.json({ error: 'Product URL is required. Use ?url=https://...' }, { status: 400 });
    }

    if (!isValidUrl(productUrl)) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const result = await getProductFromUrl(productUrl);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Could not fetch product details' }, { status: 500 });
  }
}
