import * as daraz from '../scrapers/daraz.js';
import * as priceoye from '../scrapers/priceoye.js';
import * as mega from '../scrapers/mega.js';
import * as highfy from '../scrapers/highfy.js';
import * as ishopping from '../scrapers/ishopping.js';
import * as shophive from '../scrapers/shophive.js';
import * as homeshopping from '../scrapers/homeshopping.js';
import * as olx from '../scrapers/olx.js';
import * as naheed from '../scrapers/naheed.js';
import { identifyStore, delay, sanitizeText } from '../utils/helpers.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const stores = [
  { adapter: daraz, name: 'Daraz', domain: 'daraz.pk' },
  { adapter: priceoye, name: 'PriceOye', domain: 'priceoye.pk' },
  { adapter: mega, name: 'Mega.pk', domain: 'mega.pk' },
  { adapter: highfy, name: 'Highfy', domain: 'highfy.pk' },
  // iShopping: disabled - Cloudflare blocks all server-side requests (403)
  // { adapter: ishopping, name: 'iShopping', domain: 'ishopping.pk' },
  { adapter: shophive, name: 'Shophive', domain: 'shophive.com' },
  // HomeShopping: disabled - migrated to VTEX platform, search API returns 500
  // { adapter: homeshopping, name: 'HomeShopping', domain: 'homeshopping.pk' },
  { adapter: olx, name: 'OLX', domain: 'olx.com.pk' },
  { adapter: naheed, name: 'Naheed', domain: 'naheed.pk' },
];

const ACCESSORY_KEYWORDS = ['cover', 'case', 'protector', 'screen protector', 'tempered glass', 'cable', 'charger', 'adapter', 'strap', 'pouch', 'handsfree', 'earphone', 'skin', 'lens', 'smartwatch', 'earbuds', 'buds', 'trimmer', 'speaker', 'powerbank', 'power bank', 'holder', 'stand', 'ring light', 'selfie stick'];

/**
 * Relevance filter:
 * 1. Remove accessories (unless user searched for one)
 * 2. Smart matching: the first word (usually the brand) is always required,
 *    plus at least one more word for multi-word queries.
 */
function isRelevantProduct(title, query) {
  const queryLower = query.toLowerCase().trim();
  const titleLower = title.toLowerCase();

  // Filter out accessories when user didn't search for one
  const isQueryForAccessory = ACCESSORY_KEYWORDS.some(kw => queryLower.includes(kw));
  if (!isQueryForAccessory) {
    const hasAccessoryInTitle = ACCESSORY_KEYWORDS.some(kw => {
      const regex = new RegExp(`\\b${kw}\\b`);
      if (!regex.test(titleLower)) return false;
      // Check if it's a freebie mention (e.g. "FREE CHARGER AND COVER") — don't filter these
      const freebiePat = new RegExp(`(free|with|includes|bonus|gift|included)\\s.{0,30}\\b${kw}\\b`, 'i');
      if (freebiePat.test(titleLower)) return false;
      // Otherwise it's an accessory — block it
      return true;
    });
    if (hasAccessoryInTitle) return false;
  }

  // Word matching
  const normalize = (s) => s.replace(/[-_/,.()]/g, ' ').replace(/\s+/g, ' ').trim();
  const normTitle = normalize(titleLower);
  const queryWords = normalize(queryLower).split(' ').filter(w => w.length > 1);
  const FILLER = new Set(['the', 'a', 'an', 'for', 'in', 'of', 'and', 'with', 'new', 'buy', 'online', 'price', 'best', 'top', 'pk']);

  const significantWords = queryWords.filter(w => !FILLER.has(w));
  if (significantWords.length === 0) return true;

  // Synonym mapping for Pakistani e-commerce
  const SYNONYMS = {
    'women': ['ladies', 'girl', 'female', 'woman', 'lady', 'woman'],
    'ladies': ['women', 'lady', 'girl', 'female'],
    'man': ['men', 'boy', 'male', 'gent', 'gents'],
    'men': ['man', 'boy', 'male', 'gents', 'gent'],
    'bag': ['handbag', 'purse', 'clutch', 'crossbody', 'tote', 'satchel'],
    'phone': ['mobile', 'smartphone', 'cellphone'],
    'mobile': ['phone', 'smartphone', 'cellphone'],
    'earbuds': ['buds', 'earphones', 'pods', 'airpods', 'tws'],
  };

  const getWordVariants = (word) => {
    return [word, ...(SYNONYMS[word] || [])];
  };

  const isMatchFound = (variants, target) => {
    return variants.some(v => {
      // For purely numeric model numbers like "11", enforce strict word boundaries
      // to avoid matching "111", "115", etc.
      if (/^\d+$/.test(v) && v.length >= 1) {
        const regex = new RegExp(`\\b${v}\\b`);
        return regex.test(target);
      }
      // For alphanumeric stuff or long words, simple includes is safer (e.g. "iphone11" or "redmi")
      return target.includes(v);
    });
  };

  // First significant word MUST match (or its synonym)
  const brandWord = significantWords[0];
  const brandVariants = getWordVariants(brandWord);
  if (!isMatchFound(brandVariants, normTitle)) {
    return false;
  }

  // For single-word queries, brand match is enough
  if (significantWords.length === 1) return true;

  // For multi-word queries, at least one MORE word (or its synonym) must also match
  // (Lower threshold for beauty/fashion/skincare)
  const isBroadCategory = queryLower.includes('wash') || queryLower.includes('serum') || 
                          queryLower.includes('bag') || queryLower.includes('dress') ||
                          queryLower.includes('shoe') || queryLower.includes('cream');

  const restWords = significantWords.slice(1);
  const restMatchedCount = restWords.filter(w => {
    const variants = getWordVariants(w);
    return isMatchFound(variants, normTitle);
  }).length;

  // If search for "iPhone 11", and title contains accessory keywords but query doesn't, 
  // be even more aggressive in filtering if it's an expensive category
  const involvesExpensiveTech = queryLower.includes('iphone') || queryLower.includes('samsung') || queryLower.includes('ipad');
  if (involvesExpensiveTech && !isMatchFound(restWords, normTitle) && restWords.length > 0) {
      return false; // Stricter for tech
  }

  return isBroadCategory ? restMatchedCount >= 0 : restMatchedCount >= 1;
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
      title: 'Original product, fast shipping',
      text: `Bought the ${productName} from Highfy and it came in perfect condition. 100% original and the packaging was top-notch. Very satisfied!`,
      verified: true,
      store: 'Highfy',
      storeColor: '#000000',
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
export async function searchAllStores(query, limit = 150) {
  console.log(`[ScraperEngine] Searching all stores for: "${query}"`);

  const timeout = 30000; // 30 second timeout per store

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
      const validProducts = storeProducts
        .filter(p => p.price != null && p.price > 0 && p.inStock !== false && isRelevantProduct(p.title, query));
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

  // Sort by price (cheapest first) — stores already handle relevance ranking
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

  // --- Supported store URL: scrape product + find alternatives ---
  if (storeKey) {
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

  // --- Non-store URL (image link, random product page, etc.) ---
  // First, try to extract a search query from URL params (Google, Bing, etc.)
  console.log(`[ScraperEngine] Unknown URL, attempting to extract product name: ${url}`);

  try {
    const parsedUrl = new URL(url);
    const urlQuery = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('query') ||
      parsedUrl.searchParams.get('search') || parsedUrl.searchParams.get('keyword') ||
      parsedUrl.searchParams.get('s') || parsedUrl.searchParams.get('k') || '';

    // If URL has a search query param, use it directly
    if (urlQuery.trim().length >= 2) {
      console.log(`[ScraperEngine] Found search query in URL params: "${urlQuery.trim()}"`);
      const results = await searchAllStores(urlQuery.trim(), 8);
      return {
        product: null,
        extractedQuery: urlQuery.trim(),
        sourceUrl: url,
        products: results.products,
        totalResults: results.totalResults,
        storesSearched: results.storesSearched,
        storeErrors: results.storeErrors,
        timestamp: new Date().toISOString(),
      };
    }

    // Otherwise fetch the page and extract title/meta
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      timeout: 10000,
      maxRedirects: 5,
    });

    const contentType = response.headers['content-type'] || '';

    let productName = '';

    if (contentType.includes('text/html')) {
      // It's a web page — extract from title, og:title, meta description
      const $ = cheerio.load(response.data);

      const ogTitle = $('meta[property="og:title"]').attr('content');
      const twitterTitle = $('meta[name="twitter:title"]').attr('content');
      const pageTitle = $('title').text();
      const h1 = $('h1').first().text();
      const ogDesc = $('meta[property="og:description"]').attr('content');
      const metaDesc = $('meta[name="description"]').attr('content');

      // Pick the most descriptive one
      productName = sanitizeText(ogTitle || twitterTitle || h1 || pageTitle || '');

      // If title is too generic or is a site name, try description
      const GENERIC_TITLES = ['google', 'bing', 'yahoo', 'search', 'home', 'welcome'];
      const isGeneric = productName.length < 3 || GENERIC_TITLES.some(g => productName.toLowerCase().includes(g));
      if (isGeneric) {
        productName = sanitizeText(ogDesc || metaDesc || '');
      }
    } else if (contentType.includes('image/')) {
      // It's a direct image URL — try to extract a name from the filename
      const pathname = parsedUrl.pathname;
      const filename = pathname.split('/').pop() || '';
      // Remove extension and convert dashes/underscores to spaces
      productName = filename.replace(/\.\w+$/, '').replace(/[-_+%20]+/g, ' ').trim();
    }

    // Also try extracting from URL path segments if name is still weak
    if (productName.length < 3) {
      const pathSegments = parsedUrl.pathname.split('/').filter(s => s.length > 2);
      const lastSegment = pathSegments.pop() || '';
      productName = lastSegment.replace(/\.\w+$/, '').replace(/[-_+%20]+/g, ' ').trim();
    }

    // Clean up the extracted name
    productName = productName
      .replace(/[-|–—:]/g, ' ')              // replace separators
      .replace(/\b(buy|shop|online|price|best|deal|sale|order|free shipping)\b/gi, '') // remove commerce words
      .replace(/\s+/g, ' ')
      .trim();

    // Take first 6 meaningful words to form a search query
    const words = productName.split(' ').filter(w => w.length > 1).slice(0, 6);
    const searchQuery = words.join(' ');

    if (searchQuery.length < 2) {
      return { error: 'Could not identify a product from this URL. Try pasting the product name instead.' };
    }

    console.log(`[ScraperEngine] Extracted product name: "${searchQuery}"`);

    // Search across all stores with the extracted name
    const results = await searchAllStores(searchQuery, 8);

    return {
      product: null,
      extractedQuery: searchQuery,
      sourceUrl: url,
      products: results.products,
      totalResults: results.totalResults,
      storesSearched: results.storesSearched,
      storeErrors: results.storeErrors,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[ScraperEngine] Failed to fetch URL: ${err.message}`);
    return { error: 'Could not fetch this URL. Make sure the link is accessible.' };
  }
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
