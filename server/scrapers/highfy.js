import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRequestHeaders, parsePrice, sanitizeText, truncate } from '../utils/helpers.js';

const STORE_NAME = 'Highfy';
const STORE_URL = 'https://highfy.pk';
const STORE_COLOR = '#000000'; // Sleek black for beauty/lifestyle

export async function searchProducts(query, limit = 20) {
  try {
    const searchUrl = `${STORE_URL}/search?q=${encodeURIComponent(query)}&options[prefix]=last`;
    const response = await axios.get(searchUrl, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const products = [];

    $('li.grid__item').each((i, el) => {
      if (i >= limit) return false;

      const titleEl = $(el).find('h3.card__heading').text();
      const title = sanitizeText(titleEl);
      
      const priceEl = $(el).find('.price-item--sale, .price-item--regular').first().text();
      const price = parsePrice(priceEl);

      const linkEl = $(el).find('a.full-unstyled-link').attr('href');
      const url = linkEl ? (linkEl.startsWith('http') ? linkEl : `${STORE_URL}${linkEl}`) : STORE_URL;

      const imgEl = $(el).find('.card__media img').attr('src') || $(el).find('img').attr('src');
      let image = imgEl ? (imgEl.startsWith('http') ? imgEl : `https:${imgEl}`) : '';
      if (image.includes('?')) image = image.split('?')[0]; // Clean Shopify resize params

      if (title && price) {
        products.push({
          title,
          price,
          image,
          url,
          store: STORE_NAME,
          storeUrl: STORE_URL,
          storeColor: STORE_COLOR,
          inStock: !$(el).find('.badge--bottom-left').text().toLowerCase().includes('sold out'),
        });
      }
    });

    console.log(`[${STORE_NAME}] Found ${products.length} products for "${query}"`);
    return products;
  } catch (error) {
    console.error(`[${STORE_NAME}] Search error:`, error.message);
    return [];
  }
}

export async function getProductDetails(url) {
  try {
    const response = await axios.get(url, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Shopify stores usually have JSON-LD or meta tags
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content') || '';
    const priceText = $('meta[property="og:price:amount"]').attr('content') || $('.price-item--sale, .price-item--regular').first().text();
    const price = parsePrice(priceText);

    if (title) {
      return {
        title: sanitizeText(title),
        price,
        image,
        url,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        description: truncate(sanitizeText($('meta[property="og:description"]').attr('content') || ''), 300),
        inStock: !$('.product-form__buttons [disabled]').length,
      };
    }

    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product detail error:`, error.message);
    return null;
  }
}

export default { searchProducts, getProductDetails, storeName: STORE_NAME };
