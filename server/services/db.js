import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME = 'products';

let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }

  return supabase;
}

function createProductId(product) {
  const idSource = `${product.url || ''}|${product.store || ''}`;
  return crypto.createHash('md5').update(idSource).digest('hex');
}

function normalizeProduct(rawProduct, sourceQuery = '') {
  const product = {
    title: String(rawProduct.title || '').trim(),
    store: String(rawProduct.store || '').trim(),
    url: String(rawProduct.url || '').trim(),
    image: rawProduct.image || '',
    price: rawProduct.price != null ? Number(rawProduct.price) : null,
    originalPrice: rawProduct.originalPrice != null ? Number(rawProduct.originalPrice) : null,
    rating: rawProduct.rating != null ? Number(rawProduct.rating) : null,
    reviewCount: Number(rawProduct.reviewCount) || 0,
    inStock: rawProduct.inStock !== false,
    storeColor: rawProduct.storeColor || '',
    sourceQuery: String(sourceQuery || '').trim(),
    scrapedAt: new Date().toISOString(),
  };

  return {
    ...product,
    id: createProductId(product),
  };
}

function toDbRow(product) {
  return {
    id: product.id,
    title: product.title,
    store: product.store,
    url: product.url,
    image: product.image,
    price: product.price,
    original_price: product.originalPrice,
    rating: product.rating,
    review_count: product.reviewCount,
    in_stock: product.inStock,
    store_color: product.storeColor,
    source_query: product.sourceQuery,
    scraped_at: product.scrapedAt,
  };
}

function fromDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    store: row.store,
    url: row.url,
    image: row.image,
    price: row.price,
    originalPrice: row.original_price,
    rating: row.rating,
    reviewCount: row.review_count,
    inStock: row.in_stock,
    storeColor: row.store_color,
    sourceQuery: row.source_query,
    scrapedAt: row.scraped_at,
    createdAt: row.created_at,
  };
}

export async function initDb() {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLE_NAME).select('id').limit(1);

  if (error) {
    console.error('[DB] Supabase init failed:', error.message);
    throw new Error('Supabase initialization failed. Ensure the products table exists and the service key is valid.');
  }
}

export async function saveProducts(products = [], sourceQuery = '') {
  if (!Array.isArray(products) || products.length === 0) {
    return { newCount: 0, updatedCount: 0 };
  }

  const client = getSupabaseClient();
  const normalizedProducts = [];

  for (const rawProduct of products) {
    if (!rawProduct || !rawProduct.url || !rawProduct.store) continue;
    normalizedProducts.push(normalizeProduct(rawProduct, sourceQuery));
  }

  if (normalizedProducts.length === 0) {
    return { newCount: 0, updatedCount: 0 };
  }

  const ids = normalizedProducts.map(product => product.id);
  const { data: existingRows, error: fetchError } = await client
    .from(TABLE_NAME)
    .select('id, scraped_at')
    .in('id', ids);

  if (fetchError) {
    throw fetchError;
  }

  const existingMap = new Map(existingRows?.map(row => [row.id, new Date(row.scraped_at)] || []));
  const toUpsert = [];
  let newCount = 0;
  let updatedCount = 0;

  for (const product of normalizedProducts) {
    const existingScrapedAt = existingMap.get(product.id);
    if (!existingScrapedAt) {
      newCount += 1;
      toUpsert.push(toDbRow(product));
    } else {
      updatedCount += 1;
      if (new Date(product.scrapedAt) > existingScrapedAt) {
        toUpsert.push(toDbRow(product));
      }
    }
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await client
      .from(TABLE_NAME)
      .upsert(toUpsert, { onConflict: 'id' });

    if (upsertError) {
      throw upsertError;
    }
  }

  return { newCount, updatedCount };
}

export async function queryStoredProducts(options = {}) {
  const {
    q = '',
    store = '',
    sort = 'created-desc',
    page = 1,
    limit = 50,
  } = options;

  const client = getSupabaseClient();
  const safeLimit = Number(limit) || 50;
  const safePage = Number(page) || 1;
  const start = (safePage - 1) * safeLimit;
  const end = start + safeLimit - 1;

  let query = client.from(TABLE_NAME).select('*', { count: 'exact' });

  if (q.trim().length > 0) {
    const searchValue = `%${q.trim().replace(/%/g, '%')}%`;
    query = query.or(`title.ilike.${searchValue},store.ilike.${searchValue},url.ilike.${searchValue},source_query.ilike.${searchValue}`);
  }

  if (store.trim().length > 0) {
    query = query.eq('store', store.trim());
  }

  switch (sort) {
    case 'price-asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price-desc':
      query = query.order('price', { ascending: false });
      break;
    case 'rating':
      query = query.order('rating', { ascending: false });
      break;
    case 'reviews':
      query = query.order('review_count', { ascending: false });
      break;
    case 'store':
      query = query.order('store', { ascending: true });
      break;
    case 'created-asc':
      query = query.order('scraped_at', { ascending: true });
      break;
    case 'created-desc':
    default:
      query = query.order('scraped_at', { ascending: false });
      break;
  }

  const { data, error, count } = await query.range(start, end);

  if (error) {
    console.log('[DB] Query error:', error.message);
    throw error;
  }

  return {
    total: count ?? (data?.length ?? 0),
    page: safePage,
    limit: safeLimit,
    products: (data || []).map(fromDbRow),
  };
}

export async function getDbStats() {
  const client = getSupabaseClient();

  const { data: totalData, error: totalError, count: totalCount } = await client
    .from(TABLE_NAME)
    .select('id', { count: 'exact' })
    .limit(1);

  if (totalError) {
    throw totalError;
  }

  const { data: storeRows, error: storeError } = await client
    .from(TABLE_NAME)
    .select('store', { count: 'exact' })
    .distinct('store')
    .order('store', { ascending: true });

  if (storeError) {
    throw storeError;
  }

  const { data: latestRows, error: latestError } = await client
    .from(TABLE_NAME)
    .select('scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(1);

  if (latestError) {
    throw latestError;
  }

  const latestScrape = latestRows?.[0]?.scraped_at || null;

  return {
    totalProducts: totalCount ?? (totalData?.length ?? 0),
    totalStores: storeRows?.length || 0,
    stores: (storeRows || []).map(row => row.store).filter(Boolean),
    latestScrape: latestScrape ? new Date(latestScrape).toISOString() : null,
  };
}
