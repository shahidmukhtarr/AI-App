import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRequestHeaders, parsePrice, sanitizeText, truncate } from '../utils/helpers.js';

const STORE_NAME = 'iShopping';
const STORE_URL = 'https://www.ishopping.pk';
const STORE_COLOR = '#f26522';

export async function searchProducts(query, limit = 20) {
  try {
    const searchUrl = `${STORE_URL}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    
    // Some stores might require specific headers
    const response = await axios.get(searchUrl, {
      headers: { ...getRequestHeaders(), 'Referer': STORE_URL },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const products = [];

    $('.product-item-info, .item.product.product-item').each((i, el) => {
      if (products.length >= limit) return false;

      const $el = $(el);
      const nameEl = $el.find('.product-item-link, .product-item-name a').first();
      const title = sanitizeText(nameEl.text());
      const link = nameEl.attr('href') || '';
      
      const imgEl = $el.find('img.product-image-photo, img.lazyload').first();
      const image = imgEl.attr('src') || imgEl.attr('data-src') || '';

      const priceText = $el.find('.price').first().text();
      const price = parsePrice(priceText);
      
      // out of stock indicator
      const outOfStockText = $el.find('.stock.unavailable').text().trim().toLowerCase();
      const inStock = !outOfStockText.includes('out of stock');

      if (title && price) {
        products.push({
          title,
          price,
          originalPrice: null,
          discount: null,
          image: image.startsWith('http') ? image : `${STORE_URL}${image}`,
          url: link,
          rating: 0,
          reviewCount: 0,
          store: STORE_NAME,
          storeUrl: STORE_URL,
          storeColor: STORE_COLOR,
          inStock,
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

    const title = sanitizeText($('.page-title span').text() || $('title').text());
    const image = $('meta[property="og:image"]').attr('content') || $('.gallery-placeholder img').attr('src') || '';
    
    const priceText = $('.price-box .price').first().text();
    const price = parsePrice(priceText);
    
    const description = truncate(sanitizeText($('.product.attribute.description').text()), 300);
    const inStock = !$('.stock.unavailable').length;

    if (title && price) {
      return {
        title,
        price,
        image: image.startsWith('http') ? image : (image ? `${STORE_URL}${image}` : ''),
        url,
        rating: 0,
        reviewCount: 0,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        description,
        inStock,
      };
    }
    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product detail error:`, error.message);
    return null;
  }
}

export default { searchProducts, getProductDetails, storeName: STORE_NAME };
