import axios from 'axios';
import { getRequestHeaders, parsePrice, sanitizeText } from '../utils/helpers.js';

const STORE_NAME = 'Daraz';
const STORE_URL = 'https://www.daraz.pk';
const STORE_COLOR = '#f85606';

/**
 * Daraz search via their internal AJAX catalog API.
 * Uses multi-page fetching with session cookies for reliability.
 * Endpoint: /catalog/?ajax=true&isFirstRequest=true&q=<query>&page=<n>
 */
export async function searchProducts(query, limit = 30) {
  try {
    // Fetch up to 2 pages for better coverage
    const maxPages = Math.min(Math.ceil(limit / 40), 2);
    let allItems = [];
    let sessionCookies = '';

    for (let page = 1; page <= maxPages; page++) {
      const searchUrl = `${STORE_URL}/catalog/?ajax=true&isFirstRequest=${page === 1}&q=${encodeURIComponent(query)}&page=${page}`;

      const headers = {
        ...getRequestHeaders(),
        'Accept': 'application/json, text/plain, */*',
        'Referer': `${STORE_URL}/catalog/?q=${encodeURIComponent(query)}`,
        'x-requested-with': 'XMLHttpRequest',
      };

      // Attach session cookies from first page response
      if (sessionCookies) {
        headers['Cookie'] = sessionCookies;
      }

      const response = await axios.get(searchUrl, {
        headers,
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: (status) => status < 400,
      });

      // Capture cookies for subsequent page requests
      if (page === 1 && response.headers['set-cookie']) {
        sessionCookies = response.headers['set-cookie']
          .map(c => c.split(';')[0])
          .join('; ');
      }

      const data = response.data;

      // Check for bot protection redirect
      if (typeof data === 'string' && data.includes('_____tmd_____')) {
        console.log(`[${STORE_NAME}] Bot protection detected on page ${page}, stopping pagination`);
        break;
      }

      if (!data || typeof data !== 'object') {
        console.log(`[${STORE_NAME}] Unexpected response format on page ${page}`);
        break;
      }

      const items = data?.mods?.listItems || data?.mainInfo?.listItems || [];
      if (items.length === 0) break;
      allItems.push(...items);

      if (allItems.length >= limit) break;
    }

    const items = allItems;

    const products = [];
    for (const item of items) {
      if (products.length >= limit) break;

      const title = sanitizeText(item.name || '');
      if (!title) continue;

      // Price: "Rs. 266,999" → parse the number
      const priceRaw = item.priceShow || '';
      const price = parsePrice(priceRaw);

      // Original price (strikethrough)
      const origRaw = item.originalPriceShow || '';
      const originalPrice = origRaw ? parsePrice(origRaw) : null;

      // Image
      const image = item.image || '';

      // URL: item.itemUrl can be relative (/products/...), protocol-relative (//www.daraz.pk/...), or absolute
      const itemUrl = item.itemUrl || '';
      let url;
      if (itemUrl.startsWith('http')) {
        url = itemUrl;
      } else if (itemUrl.startsWith('//')) {
        url = `https:${itemUrl}`;
      } else {
        url = `${STORE_URL}${itemUrl}`;
      }

      // Rating & reviews
      const rating = parseFloat(item.ratingScore) || 0;
      const reviewCount = parseInt(item.review) || 0;

      // Stock
      const inStock = item.inStock !== false && item.inStock !== 0;

      if (title && price && price > 0) {
        // Strict relevance: all query words must appear in the title
        const queryWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1);
        const titleLower = title.toLowerCase();
        const allMatch = queryWords.every(w => titleLower.includes(w));
        if (!allMatch) continue;

        products.push({
          title,
          price,
          originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
          image: image.startsWith('http') ? image : image ? `https:${image}` : '',
          url,
          rating,
          reviewCount,
          store: STORE_NAME,
          storeUrl: STORE_URL,
          storeColor: STORE_COLOR,
          inStock,
        });
      }
    }

    console.log(`[${STORE_NAME}] Found ${products.length} products for "${query}"`);
    return products;
  } catch (error) {
    console.error(`[${STORE_NAME}] Search error:`, error.message);
    return [];
  }
}

/**
 * Get product details from a specific Daraz product URL using axios.
 */
export async function getProductDetails(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        ...getRequestHeaders(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      timeout: 15000,
    });

    const htmlText = response.data;

    // 1. Try LD+JSON structured data (Primary source)
    const ldJsonMatch = htmlText.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    if (ldJsonMatch) {
      for (const scriptTag of ldJsonMatch) {
        try {
          const json = scriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const data = JSON.parse(json);
          if (data['@type'] === 'Product' && data.name) {
            const price = parsePrice(data.offers?.price);
            const originalPrice = parsePrice(data.offers?.highPrice);
            return {
              title: sanitizeText(data.name),
              price,
              originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
              image: Array.isArray(data.image) ? data.image[0] : (data.image || ''),
              url,
              rating: parseFloat(data.aggregateRating?.ratingValue) || 0,
              reviewCount: parseInt(data.aggregateRating?.reviewCount) || 0,
              store: STORE_NAME,
              storeUrl: STORE_URL,
              storeColor: STORE_COLOR,
              description: sanitizeText(data.description || '').slice(0, 400),
              inStock: data.offers?.availability?.includes('InStock') ?? true,
            };
          }
        } catch (_) {}
      }
    }

    // 2. Try app.run() state variable (Daraz specific)
    const appDataMatch = htmlText.match(/app\.run\((.*?)\);/);
    if (appDataMatch && appDataMatch[1]) {
      try {
        const appState = JSON.parse(appDataMatch[1]);
        const priceInfo = appState?.data?.root?.fields?.skuInfos;
        const firstSkuKey = priceInfo && Object.keys(priceInfo)[0];
        if (firstSkuKey) {
          const skuData = priceInfo[firstSkuKey];
          const price = parseFloat(skuData?.price?.salePrice?.value);
          const originalPrice = parseFloat(skuData?.price?.originalPrice?.value);
          const title = sanitizeText(appState?.data?.root?.fields?.productSku?.product?.name || '');
          const image = appState?.data?.root?.fields?.product?.images?.[0] || '';
          if (title && price) {
            return {
              title,
              price,
              originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
              image,
              url,
              rating: 0,
              reviewCount: 0,
              store: STORE_NAME,
              storeUrl: STORE_URL,
              storeColor: STORE_COLOR,
              inStock: skuData?.stock !== 0,
            };
          }
        }
      } catch (e) {}
    }

    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product detail error:`, error.message);
    return null;
  }
}

export default { searchProducts, getProductDetails, storeName: STORE_NAME };
