import axios from 'axios';
import { getRequestHeaders, parsePrice, sanitizeText, truncate } from '../utils/helpers.js';

const STORE_NAME = 'Daraz';
const STORE_URL = 'https://www.daraz.pk';
const STORE_COLOR = '#f85606';

/**
 * Search for products on Daraz.pk using their internal JSON API
 */
export async function searchProducts(query, limit = 30) {
  try {
    // Daraz has an internal AJAX API that returns JSON
    const searchUrl = `${STORE_URL}/catalog/?ajax=true&q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        ...getRequestHeaders(),
        'Accept': 'application/json',
        'Referer': `${STORE_URL}/catalog/?q=${encodeURIComponent(query)}`,
      },
      timeout: 15000,
    });

    const data = response.data;
    const items = data?.mods?.listItems || [];
    const products = [];

    for (const item of items.slice(0, limit)) {
      const price = parsePrice(item.price);
      if (!price) continue;

      // Build proper URL from itemUrl
      let productUrl = '';
      if (item.itemUrl) {
        productUrl = item.itemUrl.startsWith('//') 
          ? `https:${item.itemUrl}` 
          : item.itemUrl.startsWith('http') 
            ? item.itemUrl 
            : `${STORE_URL}${item.itemUrl}`;
      }

      products.push({
        title: sanitizeText(item.name || ''),
        price,
        originalPrice: parsePrice(item.originalPrice),
        discount: item.discount || null,
        image: item.image || '',
        url: productUrl || `${STORE_URL}/catalog/?q=${encodeURIComponent(query)}`,
        rating: parseFloat(item.ratingScore) || 0,
        reviewCount: parseInt(item.review) || 0,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        inStock: item.inStock !== false,
        location: item.location || '',
        brand: item.brandName || '',
      });
    }

    console.log(`[${STORE_NAME}] Found ${products.length} products for "${query}"`);
    return products;
  } catch (error) {
    console.error(`[${STORE_NAME}] Search error:`, error.message);
    return [];
  }
}

/**
 * Get product details from a Daraz URL
 */
export async function getProductDetails(url) {
  try {
    const response = await axios.get(url, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const html = response.data;
    
    // Try to extract from JSON-LD structured data
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        if (data.name) {
          return {
            title: sanitizeText(data.name),
            price: parsePrice(data.offers?.price || data.offers?.lowPrice),
            originalPrice: parsePrice(data.offers?.highPrice),
            image: Array.isArray(data.image) ? data.image[0] : data.image || '',
            url,
            rating: parseFloat(data.aggregateRating?.ratingValue) || 0,
            reviewCount: parseInt(data.aggregateRating?.reviewCount) || 0,
            store: STORE_NAME,
            storeUrl: STORE_URL,
            storeColor: STORE_COLOR,
            description: sanitizeText(data.description || ''),
            inStock: data.offers?.availability?.includes('InStock') ?? true,
          };
        }
      } catch (e) { /* continue */ }
    }

    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product detail error:`, error.message);
    return null;
  }
}

export default { searchProducts, getProductDetails, storeName: STORE_NAME };
