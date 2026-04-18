import * as daraz from '../scrapers/daraz.js';
import * as priceoye from '../scrapers/priceoye.js';
import * as mega from '../scrapers/mega.js';
import * as shophive from '../scrapers/shophive.js';
import * as naheed from '../scrapers/naheed.js';
import * as highfy from '../scrapers/highfy.js';
import { identifyStore, delay, sanitizeText, getRequestHeaders } from '../utils/helpers.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { saveProducts } from './db.js';
import { getRelevantCategoryUrls, CATEGORY_PAGE_CONFIG } from './categoryLinks.js';

const stores = [
  { adapter: daraz, name: 'Daraz', domain: 'daraz.pk' },
  { adapter: priceoye, name: 'PriceOye', domain: 'priceoye.pk' },
  { adapter: mega, name: 'Mega.pk', domain: 'mega.pk' },
  { adapter: shophive, name: 'Shophive', domain: 'shophive.com' },
  { adapter: naheed, name: 'Naheed', domain: 'naheed.pk' },
  { adapter: highfy, name: 'Highfy', domain: 'highfy.pk' },
];

const ACCESSORY_KEYWORDS = ['cover', 'case', 'protector', 'screen protector', 'tempered glass', 'cable', 'charger', 'adapter', 'strap', 'pouch', 'handsfree', 'earphone', 'skin', 'lens', 'smartwatch', 'earbuds', 'buds', 'trimmer', 'speaker', 'powerbank', 'power bank', 'holder', 'stand', 'ring light', 'selfie stick'];

function normalizeUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

function isLikelyProductLink(url, baseHost) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('javascript:') || url.startsWith('#')) return false;

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== baseHost) return false;

    const pathname = parsed.pathname.toLowerCase();
    const forbidden = ['/login', '/cart', '/checkout', '/account', '/help', '/faq', '/terms', '/privacy', '/policy', '/contact', '/wishlist', '/compare', '/blog', '/news', '/offers', '/events'];
    if (forbidden.some((token) => pathname.includes(token))) return false;
    if (pathname.length < 5) return false;
    if (pathname === '/') return false;

    const productIndicators = ['/product', '/products', '/item', '/p/', '/detail', '/details', '/view', '/shop/', '/catalog/'];
    if (productIndicators.some((token) => pathname.includes(token))) return true;

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length >= 3 && segments.some((segment) => /(product|item|mobile|phone|laptop|watch|camera|camera|tv|console|tablet|accessory)/.test(segment))) {
      return true;
    }

    return segments.some((segment) => segment.length > 6 && /[a-z]/.test(segment) && /\d/.test(segment));
  } catch {
    return false;
  }
}

/**
 * Relevance filter:
 * 1. Remove accessories (unless user searched for one)
 * 2. Smart matching: the first word (usually the brand) is always required,
 *    plus at least one more word for multi-word queries.
 */
function isRelevantProduct(title, query) {
  const queryLower = query.toLowerCase().trim();
  const titleLower = title.toLowerCase();

  // Prevent deceptive listings (e.g., Earbuds stuffing "Power Bank" in title)
  const DECEPTIVE_KEYWORDS = {
    'power bank': ['earbuds', 'buds', 'tws', 'earphone', 'headphone', 'm10', 'm19', 'm90', 'airpods', 'headset', 'm88', 'i7s'],
  };
  
  for (const [targetKey, avoidWords] of Object.entries(DECEPTIVE_KEYWORDS)) {
    if (queryLower.includes(targetKey) && !avoidWords.some(w => queryLower.includes(w))) {
      // User searched for targetKey but NOT the avoidWords. If title has avoidWords, reject.
      if (avoidWords.some(w => new RegExp(`\\b${w}\\b`).test(titleLower))) {
        return false;
      }
    }
  }

  // Filter out accessories when user didn't search for one
  const isQueryForAccessory = ACCESSORY_KEYWORDS.some(kw => queryLower.includes(kw));
  if (!isQueryForAccessory) {
    const hasAccessoryInTitle = ACCESSORY_KEYWORDS.some(kw => {
      const regex = new RegExp(`\\b${kw}\\b`);
      if (!regex.test(titleLower)) return false;
      const freebiePat = new RegExp(`(free|with|includes|bonus|gift|included)\\s.{0,30}\\b${kw}\\b`, 'i');
      if (freebiePat.test(titleLower)) return false;
      return true;
    });
    if (hasAccessoryInTitle) return false;
  }

  const normalize = (s) => s
    .replace(/[-_/,.()'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normTitle = normalize(titleLower);
  const queryWords = normalize(queryLower).split(' ').filter(w => w.length > 1);
  const FILLER = new Set(['the', 'a', 'an', 'for', 'in', 'of', 'and', 'with', 'new', 'buy', 'online', 'price', 'best', 'top', 'pk', 'care', 'home']);

  const significantWords = queryWords.filter(w => !FILLER.has(w));
  if (significantWords.length === 0) return true;

  const SYNONYMS = {
    'women': ['ladies', 'girl', 'female', 'woman', 'lady'],
    'ladies': ['women', 'lady', 'girl', 'female'],
    'men': ['man', 'boy', 'male', 'gent', 'gents'],
    'man': ['men', 'boy', 'male', 'gent', 'gents'],
    'bag': ['handbag', 'purse', 'clutch', 'crossbody', 'tote', 'satchel'],
    'phone': ['mobile', 'smartphone', 'cellphone'],
    'mobile': ['phone', 'smartphone', 'cellphone'],
    'monitor': ['display', 'screen'],
    'headphone': ['headset', 'earphone', 'earphones'],
    'earbuds': ['buds', 'earphones', 'pods', 'airpods', 'tws'],
    'keyboard': ['board'],
    'charger': ['adapter', 'powerbank', 'charger'],
    'laptop': ['notebook', 'macbook'],
    'television': ['tv', 'smart tv'],
    'soap': ['cleanser'],
    'cream': ['moisturizer', 'lotion'],
    'lotion': ['cream', 'moisturizer'],
    'shoes': ['footwear', 'sneakers', 'sandals', 'trainers', 'slippers'],
    'watch': ['wristwatch'],
    'camera': ['dslr', 'mirrorless'],
    'printer': ['laser printer', 'inkjet'],
  };

  const GENERIC_DESCRIPTORS = new Set([
    'lightweight', 'wireless', 'portable', 'soft', 'comfortable', 'casual', 'stylish',
    'cheap', 'new', 'premium', 'budget', 'smart', 'gaming', 'compact',
    'small', 'large', 'waterproof', 'durable', 'fashion', 'running', 'sports', 'gym', 'travel',
    'moisturizing', 'protective', 'natural', 'organic', 'herbal', 'daily', 'intense',
    'clear', 'pure', 'gentle', 'deep', 'night', 'day', 'face', 'body', 'hair', 'skin',
    'fresh', 'strong', 'soft', 'extra', 'mini', 'pro', 'plus', 'max'
  ]);

  const getWordVariants = (word) => [word, ...(SYNONYMS[word] || [])];
  const doesMatch = (word) => getWordVariants(word).some(v => {
    if (/^\d+$/.test(v)) {
      return new RegExp(`\\b${v}\\b`).test(normTitle);
    }
    return normTitle.includes(v);
  });

  const coreWords = significantWords.filter(w => !GENERIC_DESCRIPTORS.has(w));
  const descriptorWords = significantWords.filter(w => GENERIC_DESCRIPTORS.has(w));

  const matchedCore = coreWords.filter(doesMatch);
  const matchedDescriptors = descriptorWords.filter(doesMatch);

  if (coreWords.length === 0) {
    return matchedDescriptors.length > 0;
  }

  if (coreWords.length === 1) {
    return matchedCore.length === 1;
  }

  if (coreWords.length === 2) {
    return matchedCore.length === 2 || (matchedCore.length === 1 && matchedDescriptors.length > 0);
  }

  const lastCoreWord = coreWords[coreWords.length - 1];
  const hasLastCoreMatch = doesMatch(lastCoreWord);
  return matchedCore.length >= coreWords.length - 1 && hasLastCoreMatch;
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

  const saveResult = await saveProducts(allProducts, query);
  console.log(`[ScraperEngine] Saved products for query "${query}": new=${saveResult.newCount}, updated=${saveResult.updatedCount}`);

  return {
    query,
    totalResults: allProducts.length,
    savedCount: saveResult.newCount,
    updatedCount: saveResult.updatedCount,
    storesSearched,
    storeErrors,
    usedFallback: false,
    products: allProducts,
    timestamp: new Date().toISOString(),
  };
}

export async function scrapeCategoryUrl(url, limit = 20) {
  const validUrl = String(url || '').trim();
  if (!validUrl || !identifyStore(validUrl)) {
    throw new Error('Please provide a valid store category page URL.');
  }

  const storeKey = identifyStore(validUrl);
  const store = stores.find((s) => s.domain.includes(storeKey));
  if (!store) {
    throw new Error('Unsupported store for category scraping.');
  }

  // Daraz fast path: use JSON API instead of slow HTML link crawling
  if (storeKey === 'daraz') {
    return scrapeDarazCategoryFast(validUrl, limit);
  }

  const response = await axios.get(validUrl, {
    headers: getRequestHeaders(),
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);
  const baseHost = new URL(validUrl).hostname;
  const discoveredUrls = new Set();

  $('a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '').trim();
    const absoluteUrl = normalizeUrl(href, validUrl);
    if (!absoluteUrl) return;
    if (absoluteUrl === validUrl) return;
    if (isLikelyProductLink(absoluteUrl, baseHost)) {
      discoveredUrls.add(absoluteUrl);
    }
  });

  const productUrls = Array.from(discoveredUrls).slice(0, limit * 3);
  const products = [];

  for (const productUrl of productUrls) {
    if (products.length >= limit) break;
    try {
      const item = await store.adapter.getProductDetails(productUrl);
      if (item && item.title && item.price && item.url) {
        products.push(item);
      }
    } catch (error) {
      // ignore individual product URL failures
    }
    await delay(250);
  }

  const saveResult = await saveProducts(products, `category:${validUrl}`);

  return {
    url: validUrl,
    scannedLinks: productUrls.length,
    validProducts: products.length,
    savedCount: saveResult.newCount,
    updatedCount: saveResult.updatedCount,
    products,
    timestamp: new Date().toISOString(),
  };
}

async function scrapeDarazCategoryFast(url, limit = 20) {
  // Convert category page URL to JSON API URL
  // e.g. https://www.daraz.pk/laptops/ → https://www.daraz.pk/laptops/?ajax=true
  // e.g. https://www.daraz.pk/catalog?q=Laptops → https://www.daraz.pk/catalog?q=Laptops&ajax=true
  const separator = url.includes('?') ? '&' : '?';
  const apiUrl = `${url}${separator}ajax=true&isFirstRequest=true&page=1`;

  const response = await axios.get(apiUrl, {
    headers: {
      ...getRequestHeaders(),
      'x-requested-with': 'XMLHttpRequest',
      'Accept': 'application/json',
    },
    timeout: 30000,
  });

  const data = response.data;
  if (!data?.mods?.listItems) {
    // Fallback: if JSON API fails, try the HTML version with searchProducts
    const urlObj = new URL(url);
    const query = urlObj.searchParams.get('q') || urlObj.pathname.split('/').filter(Boolean)[0] || '';
    if (query) {
      const results = await daraz.searchProducts(query);
      const products = results.slice(0, limit);
      const saveResult = await saveProducts(products, `category:${url}`);
      return {
        url,
        scannedLinks: results.length,
        validProducts: products.length,
        savedCount: saveResult.newCount,
        updatedCount: saveResult.updatedCount,
        products,
        timestamp: new Date().toISOString(),
      };
    }
    throw new Error('Daraz category returned no products');
  }

  const items = data.mods.listItems;
  const products = items.slice(0, limit).map(item => {
    let itemUrl = item.itemUrl || item.productUrl || '';
    if (itemUrl.startsWith('//')) itemUrl = 'https:' + itemUrl;
    else if (!itemUrl.startsWith('http')) itemUrl = 'https://www.daraz.pk' + itemUrl;

    const originalPrice = parseFloat(String(item.originalPrice || item.price || '0').replace(/[^0-9.]/g, ''));
    const salePrice = parseFloat(String(item.price || '0').replace(/[^0-9.]/g, ''));

    return {
      title: item.name || item.title || 'Unknown',
      price: salePrice || originalPrice || 0,
      originalPrice: originalPrice || salePrice || 0,
      url: itemUrl,
      image: item.image || '',
      store: 'Daraz',
      rating: parseFloat(item.ratingScore || '0') || 0,
      reviews: parseInt(item.review || '0', 10) || 0,
    };
  }).filter(p => p.title && p.price > 0 && p.url);

  const saveResult = await saveProducts(products, `category:${url}`);

  return {
    url,
    scannedLinks: items.length,
    validProducts: products.length,
    savedCount: saveResult.newCount,
    updatedCount: saveResult.updatedCount,
    products,
    timestamp: new Date().toISOString(),
  };
}

export async function scrapeRelevantCategoryPages(query, limitPerCategory = 8) {
  const urls = getRelevantCategoryUrls(query);
  if (urls.length === 0) {
    return {
      query,
      urlCount: 0,
      scannedUrls: [],
      savedCount: 0,
      updatedCount: 0,
      pages: [],
      timestamp: new Date().toISOString(),
    };
  }

  const pages = [];
  let savedCount = 0;
  let updatedCount = 0;

  for (const url of urls.slice(0, 6)) {
    try {
      const result = await scrapeCategoryUrl(url, limitPerCategory);
      pages.push({ url, status: 'success', ...result });
      savedCount += result.savedCount || 0;
      updatedCount += result.updatedCount || 0;
    } catch (error) {
      pages.push({ url, status: 'failed', error: error?.message || 'Category scrape failed' });
    }
    await delay(250);
  }

  return {
    query,
    urlCount: urls.length,
    scannedUrls: urls.slice(0, 6),
    savedCount,
    updatedCount,
    pages,
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

    await saveProducts([product], product.title || url);

    // Also search other stores for the same product
    const searchQuery = product.title.split(' ').slice(0, 5).join(' ');
    const otherResults = await searchAllStores(searchQuery, 6);

    if (otherResults.products && otherResults.products.length > 0) {
      await saveProducts(otherResults.products, searchQuery);
    }

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

    if (results.products && results.products.length > 0) {
      await saveProducts(results.products, searchQuery);
    }

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

/**
 * Seed ALL category products into the DB by running keyword searches
 * through each store's native adapter (not HTML link crawling).
 *
 * For each entry in CATEGORY_PAGE_CONFIG:
 *   - Determine which store adapter matches (by store name)
 *   - Run `adapter.searchProducts(categoryTitle, limitPerCategory)`
 *   - Save results to DB tagged with the category title
 *
 * @param {object} options
 * @param {number} options.limitPerCategory - Max products per category search (default 30)
 * @param {function} options.onProgress - Optional callback(current, total, entry)
 */
export async function scrapeAllCategoryLinks({ limitPerCategory = 30, onProgress } = {}) {
  const total = CATEGORY_PAGE_CONFIG.length;
  let totalSaved = 0;
  let totalUpdated = 0;
  let totalProducts = 0;
  let successCount = 0;
  let failCount = 0;
  const results = [];

  console.log(`[CategorySeed] Starting keyword-based category seed: ${total} categories, up to ${limitPerCategory} products each`);

  // Build a store name → adapter mapping
  const storeAdapterMap = {};
  for (const s of stores) {
    storeAdapterMap[s.name.toLowerCase()] = s;
  }

  for (let i = 0; i < CATEGORY_PAGE_CONFIG.length; i++) {
    const entry = CATEGORY_PAGE_CONFIG[i];
    if (onProgress) onProgress(i + 1, total, entry);

    const storeKey = entry.store.toLowerCase();
    const storeEntry = storeAdapterMap[storeKey];

    if (!storeEntry) {
      results.push({ url: entry.url, store: entry.store, title: entry.title, status: 'skipped', reason: 'No matching adapter' });
      console.log(`[CategorySeed] [${i + 1}/${total}] ${entry.store} / ${entry.title}: SKIPPED (no adapter)`);
      continue;
    }

    // Use the category title as the primary search keyword
    const searchQuery = entry.title;

    try {
      const products = await storeEntry.adapter.searchProducts(searchQuery, limitPerCategory);
      const validProducts = products.filter(p => p && p.title && p.price && p.price > 0 && p.url);

      if (validProducts.length > 0) {
        const saveResult = await saveProducts(validProducts, `category:${entry.title}`);
        totalSaved += saveResult.newCount || 0;
        totalUpdated += saveResult.updatedCount || 0;
        totalProducts += validProducts.length;
        successCount++;
        results.push({ url: entry.url, store: entry.store, title: entry.title, status: 'success', validProducts: validProducts.length, savedCount: saveResult.newCount });
        console.log(`[CategorySeed] [${i + 1}/${total}] ${entry.store} / ${entry.title}: ${validProducts.length} products, ${saveResult.newCount} saved`);
      } else {
        failCount++;
        results.push({ url: entry.url, store: entry.store, title: entry.title, status: 'empty', validProducts: 0, savedCount: 0 });
        console.log(`[CategorySeed] [${i + 1}/${total}] ${entry.store} / ${entry.title}: 0 valid products`);
      }
    } catch (err) {
      failCount++;
      results.push({ url: entry.url, store: entry.store, title: entry.title, status: 'failed', error: err?.message || 'Scrape error' });
      console.log(`[CategorySeed] [${i + 1}/${total}] ${entry.store} / ${entry.title}: FAILED — ${err?.message}`);
    }

    // Polite delay between category requests
    await delay(800);
  }

  console.log(`[CategorySeed] Done. ${successCount}/${total} succeeded, ${totalProducts} products, ${totalSaved} saved, ${totalUpdated} updated.`);

  return {
    total,
    successCount,
    failCount,
    totalProducts,
    totalSaved,
    totalUpdated,
    results,
    timestamp: new Date().toISOString(),
  };
}

export default { searchAllStores, getProductFromUrl, getReviews, getSupportedStores, scrapeAllCategoryLinks };
