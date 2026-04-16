import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRequestHeaders, parsePrice, sanitizeText } from '../utils/helpers.js';

const STORE_NAME = 'OLX';
const STORE_URL = 'https://www.olx.com.pk';
const STORE_COLOR = '#002f34';

/**
 * Extract product listings from OLX search results HTML.
 * Uses <li aria-label="Listing"> product cards which contain:
 * - <a href="/item/{slug}-iid-{id}"> with correct product URLs
 * - "Rs X,XXX" text for prices
 */
function extractItemsFromHtml(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('li[aria-label="Listing"]').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a[href*="/item/"]').first();
    let href = $a.attr('href') || '';
    const title = $a.attr('title') || $el.attr('title') || '';
    if (!href || !title) return;

    // Ensure full URL
    if (href.startsWith('/')) href = `${STORE_URL}${href}`;

    // Deduplicate by href
    if (seen.has(href)) return;
    seen.add(href);

    // Extract price from "Rs X,XXX" or "Rs X.XX Lac/Crore" text within the listing
    const text = $el.text();
    let price = 0;
    const lacMatch = text.match(/Rs\s*([\d.]+)\s*(Lac|Lakh|Crore)/i);
    if (lacMatch) {
      const num = parseFloat(lacMatch[1]);
      const unit = lacMatch[2].toLowerCase();
      price = unit === 'crore' ? Math.round(num * 10000000) : Math.round(num * 100000);
    } else {
      const priceMatch = text.match(/Rs\s*([\d,]+)/);
      price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;
    }

    // Extract image
    const $img = $el.find('img[src*="olx.com.pk"], img[data-src*="olx.com.pk"]');
    const image = $img.attr('src') || $img.attr('data-src') || '';

    items.push({
      title: title.replace(/\\u002F/g, '/').replace(/\\"/g, '"'),
      price,
      url: href,
      image,
    });
  });

  return items;
}

/**
 * Search for products on OLX.com.pk
 * OLX is a classifieds marketplace — products are user-listed, often second-hand.
 */
export async function searchProducts(query, limit = 20) {
  try {
    const slug = query.trim().replace(/\s+/g, '-');
    const searchUrl = `${STORE_URL}/items/q-${slug}`;

    const response = await axios.get(searchUrl, {
      headers: {
        ...getRequestHeaders(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': STORE_URL,
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = response.data;
    const items = extractItemsFromHtml(html);
    const products = [];

    for (const item of items) {
      if (products.length >= limit) break;
      if (item.price <= 0) continue;

      products.push({
        title: sanitizeText(item.title),
        price: item.price,
        originalPrice: null,
        discount: null,
        image: item.image,
        url: item.url,
        rating: 0,
        reviewCount: 0,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        inStock: true,
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
 * Get product details from an OLX URL
 */
export async function getProductDetails(url) {
  try {
    const response = await axios.get(url, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const html = response.data;

    // Extract from embedded state data
    const titleMatch = html.match(/"title":"([^"]+)"/);
    const priceMatch = html.match(/"price":(\d+)/);
    const coverMatch = html.match(/"coverPhoto":\{[^}]*"id":(\d+)/);
    const descMatch = html.match(/"description":"([^"]{0,500})"/);

    const title = titleMatch ? titleMatch[1].replace(/\\u002F/g, '/') : null;
    const price = priceMatch ? parseInt(priceMatch[1]) : null;

    if (title && price && price > 0) {
      return {
        title: sanitizeText(title),
        price,
        originalPrice: null,
        image: coverMatch ? `https://images.olx.com.pk/thumbnails/${coverMatch[1]}-400x300.webp` : '',
        url,
        rating: 0,
        reviewCount: 0,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        description: descMatch ? sanitizeText(descMatch[1].replace(/\\u002F/g, '/')) : '',
        inStock: true,
      };
    }

    // Fallback: meta tags
    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/)?.[1];
    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] || '';
    const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/)?.[1] || '';
    const bodyPrice = html.match(/Rs\.?\s*([\d,]+)/i);

    if (ogTitle && bodyPrice) {
      return {
        title: sanitizeText(ogTitle),
        price: parsePrice(bodyPrice[0]),
        originalPrice: null,
        image: ogImage,
        url,
        rating: 0,
        reviewCount: 0,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        description: sanitizeText(ogDesc),
        inStock: true,
      };
    }

    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product details error:`, error.message);
    return null;
  }
}
