import * as daraz from '../scrapers/daraz.js';
import * as priceoye from '../scrapers/priceoye.js';
import * as mega from '../scrapers/mega.js';
import * as telemart from '../scrapers/telemart.js';
import * as ishopping from '../scrapers/ishopping.js';
import * as shophive from '../scrapers/shophive.js';
import * as homeshopping from '../scrapers/homeshopping.js';
import * as olx from '../scrapers/olx.js';
import * as naheed from '../scrapers/naheed.js';
import { identifyStore, delay } from '../utils/helpers.js';

const stores = [
  { adapter: daraz, name: 'Daraz', domain: 'daraz.pk' },
  { adapter: priceoye, name: 'PriceOye', domain: 'priceoye.pk' },
  { adapter: mega, name: 'Mega.pk', domain: 'mega.pk' },
  { adapter: telemart, name: 'Telemart', domain: 'telemart.pk' },
  // iShopping: disabled - Cloudflare blocks all server-side requests (403)
  // { adapter: ishopping, name: 'iShopping', domain: 'ishopping.pk' },
  { adapter: shophive, name: 'Shophive', domain: 'shophive.com' },
  // HomeShopping: disabled - migrated to VTEX platform, search API returns 500
  // { adapter: homeshopping, name: 'HomeShopping', domain: 'homeshopping.pk' },
  { adapter: olx, name: 'OLX', domain: 'olx.com.pk' },
  { adapter: naheed, name: 'Naheed', domain: 'naheed.pk' },
];

const ACCESSORY_KEYWORDS = ['cover', 'case', 'protector', 'glass', 'cable', 'charger', 'adapter', 'strap', 'pouch', 'handsfree', 'earphone', 'battery', 'back', 'skin', 'lens', 'watch', 'smartwatch', 'band', 'earbuds', 'buds', 'airpods', 'trimmer', 'speaker', 'powerbank'];

function isRelevantProduct(title, query) {
  const queryLower = query.toLowerCase().trim();
  const titleLower = title.toLowerCase();

  const isQueryForAccessory = ACCESSORY_KEYWORDS.some(kw => queryLower.includes(kw));

  if (!isQueryForAccessory) {
    const hasAccessoryInTitle = ACCESSORY_KEYWORDS.some(kw => {
      const regex = new RegExp(`\\b${kw}\\b`);
      return regex.test(titleLower);
    });
    if (hasAccessoryInTitle) {
      return false;
    }
  }

  // --- Strict multi-word matching ---
  // Normalize common variations
  const normalize = (s) => s
    .replace(/\+/g, ' plus ')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normQuery = normalize(queryLower);
  const normTitle = normalize(titleLower);

  const queryWords = normQuery.split(' ').filter(w => w.length > 0);
  // Ignore very short filler words for matching
  const FILLER = new Set(['the', 'a', 'an', 'for', 'in', 'of', 'and', 'with', 'new', 'pk']);
  const significantWords = queryWords.filter(w => !FILLER.has(w) && w.length > 1);

  if (significantWords.length === 0) return true;

  // ALL significant query words must appear in the title
  const missingWords = significantWords.filter(word => {
    // Try exact substring first
    if (normTitle.includes(word)) return false;
    // Try word boundary match for short tokens (e.g. "s24" shouldn't match "s24s")
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}`, 'i');
    if (re.test(normTitle)) return false;
    return true;
  });

  if (missingWords.length > 0) {
    return false;
  }

  return true;
}

function generateDemoReviews(query) {
  const productName = query.startsWith('http') ? 'this product' : query;
  return [
    {
      author: 'Ahmed K.',
      rating: 5,
      date: '2026-03-15',
      title: 'Excellent product!',
      text: `Really happy with my purchase of ${productName}. The quality is amazing and delivery was within 3 days. Highly recommended for anyone looking for this in Pakistan.`,
      verified: true,
      store: 'Daraz',
      storeColor: '#f85606',
      helpful: 45,
    },
    {
      author: 'Fatima S.',
      rating: 4,
      date: '2026-03-10',
      title: 'Good value for money',
      text: `${productName} is exactly as described. Good quality and the price was the lowest I found online. Only giving 4 stars because packaging could have been better.`,
      verified: true,
      store: 'PriceOye',
      storeColor: '#e21b70',
      helpful: 32,
    },
    {
      author: 'Muhammad R.',
      rating: 5,
      date: '2026-02-28',
      title: 'Best purchase this year',
      text: 'Outstanding quality! I compared prices on multiple stores and this was the best deal. The seller was very responsive and shipping was fast to Lahore.',
      verified: true,
      store: 'Daraz',
      storeColor: '#f85606',
      helpful: 67,
    },
    {
      author: 'Ayesha M.',
      rating: 3,
      date: '2026-02-20',
      title: 'Decent but expected more',
      text: 'The product is okay for the price. It works fine but I was expecting slightly better build quality. Customer service was helpful when I had questions.',
      verified: false,
      store: 'Mega.pk',
      storeColor: '#0071dc',
      helpful: 12,
    },
    {
      author: 'Hassan T.',
      rating: 5,
      date: '2026-02-15',
      title: 'PTA approved, genuine product',
      text: `Bought the ${productName} from here and it came with official warranty. PTA approved and works perfectly on all networks. Very satisfied!`,
      verified: true,
      store: 'Telemart',
      storeColor: '#00b300',
      helpful: 89,
    },
    {
      author: 'Sara A.',
      rating: 4,
      date: '2026-01-30',
      title: 'Fast delivery to Karachi',
      text: 'Ordered on Monday, received on Wednesday. Product condition is brand new as promised. Would buy again from this seller.',
      verified: true,
      store: 'Daraz',
      storeColor: '#f85606',
      helpful: 23,
    },
  ];
}

/**
 * Search across all stores in parallel
 */
export async function searchAllStores(query, limit = 40) {
  console.log(`[ScraperEngine] Searching all stores for: "${query}"`);

  const timeout = 20000; // 20 second timeout per store

  // Run all scrapers in parallel with timeout
  const results = await Promise.allSettled(
    stores.map(store =>
      Promise.race([
        store.adapter.searchProducts(query, limit),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${store.name} timeout`)), timeout)
        )
      ])
    )
  );

  let allProducts = [];
  let storesSearched = [];
  let storeErrors = [];

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const store = stores[index];
    const storeName = store.name;

    let storeProducts = result.status === 'fulfilled' ? result.value : [];

    // Magical Fallback: PriceOye's internal search often hides phones. Guess the URL directly!
    if (storeName === 'PriceOye' && (!storeProducts || storeProducts.filter(p => isRelevantProduct(p.title, query)).length === 0)) {
      console.log(`[ScraperEngine] PriceOye search failed/filtered. Attempting direct URL guess...`);
      const slug = query.toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const brand = slug.split('-')[0];
      const guessedUrl = `https://priceoye.pk/mobiles/${brand}/${slug}`;
      try {
        const directProduct = await store.adapter.getProductDetails(guessedUrl);
        if (directProduct && isRelevantProduct(directProduct.title, query)) {
          console.log(`[ScraperEngine] PriceOye direct URL guess SUCCESS: ${guessedUrl}`);
          storeProducts = [directProduct];
        }
      } catch (e) {
        // Silently fail if guessed URL is 404
      }
    }

    if (storeProducts && storeProducts.length > 0) {
      const validProducts = storeProducts.filter(p => p.price != null && p.price > 0 && p.inStock !== false && isRelevantProduct(p.title, query));
      if (validProducts.length > 0) {
        allProducts.push(...validProducts);
        storesSearched.push(storeName);
        console.log(`[ScraperEngine] ${storeName}: ${validProducts.length} valid products found`);
      } else {
        const reason = 'No valid/in-stock products found';
        storeErrors.push({ store: storeName, error: reason });
        console.log(`[ScraperEngine] ${storeName}: Failed - ${reason}`);
      }
    } else {
      const reason = result.status === 'rejected' ? result.reason?.message : 'No results';
      storeErrors.push({ store: storeName, error: reason });
      console.log(`[ScraperEngine] ${storeName}: Failed - ${reason}`);
    }
  }

  // No fallback logic, let it naturally return 0 results
  if (allProducts.length === 0) {
    console.log('[ScraperEngine] All scrapers failed to find valid products');
  }

  // Sort by price (cheapest first), handle null prices
  allProducts.sort((a, b) => {
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return a.price - b.price;
  });

  return {
    query,
    totalResults: allProducts.length,
    storesSearched,
    storeErrors,
    usedFallback: false,
    products: allProducts,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get product details from a specific URL
 */
export async function getProductFromUrl(url) {
  const storeKey = identifyStore(url);

  if (!storeKey) {
    return { error: 'Unsupported store URL. Supported stores: Daraz, PriceOye, Mega.pk, Telemart' };
  }

  const store = stores.find(s => s.domain.includes(storeKey));
  if (!store) {
    return { error: 'Store adapter not found' };
  }

  console.log(`[ScraperEngine] Fetching product from ${store.name}: ${url}`);

  const product = await store.adapter.getProductDetails(url);

  if (!product) {
    return { error: `Could not extract product details from ${store.name}` };
  }

  // Also search other stores for the same product
  const searchQuery = product.title.split(' ').slice(0, 5).join(' ');
  const otherResults = await searchAllStores(searchQuery, 6);

  return {
    product,
    alternatives: otherResults.products.filter(p => p.store !== product.store),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get reviews
 */
export async function getReviews(query) {
  // For now, return demo reviews since review scraping requires 
  // deeper page navigation (JS-rendered content on most stores)
  return {
    query,
    reviews: generateDemoReviews(query),
    totalReviews: 6,
    averageRating: 4.3,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get supported stores list
 */
export function getSupportedStores() {
  return stores.map(s => ({
    name: s.name,
    domain: s.domain,
    url: `https://${s.domain}`,
  }));
}

export default { searchAllStores, getProductFromUrl, getReviews, getSupportedStores };
