import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRequestHeaders, parsePrice, sanitizeText, truncate } from '../utils/helpers.js';

const STORE_NAME = 'Shophive';
const STORE_URL = 'https://www.shophive.com';
const STORE_COLOR = '#ee2e24';

export async function searchProducts(query, limit = 20) {
  try {
    const searchUrl = `${STORE_URL}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const products = [];

    $('.product-item-info, .item.product-item').each((i, el) => {
      if (products.length >= limit) return false;

      const $el = $(el);
      const nameEl = $el.find('.product-item-link').first();
      const title = sanitizeText(nameEl.text());
      const link = nameEl.attr('href') || '';
      
      const imgEl = $el.find('.product-image-photo, img').first();
      let image = imgEl.attr('data-amsrc') || imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('src') || '';
      
      if (image.includes('placeholder')) {
        image = '';
      }
      
      if (image && !image.startsWith('http')) {
        image = image.startsWith('/') ? `${STORE_URL}${image}` : `${STORE_URL}/${image}`;
      }

      const priceText = $el.find('.price').first().text();
      const price = parsePrice(priceText);
      const inStock = !$el.find('.out-of-stock').length;

      if (title && price) {
        products.push({
          title,
          price,
          originalPrice: null,
          discount: null,
          image,
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
    const image = $('meta[property="og:image"]').attr('content') || '';
    
    const priceText = $('.price-box .price').first().text();
    const price = parsePrice(priceText);
    
    const description = truncate(sanitizeText($('.product.attribute.overview').text()), 300);
    const inStock = !$('.stock.unavailable').length;

    if (title && price) {
      return {
        title, price, image, url, rating: 0, reviewCount: 0,
        store: STORE_NAME, storeUrl: STORE_URL, storeColor: STORE_COLOR,
        description, inStock,
      };
    }
    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product detail error:`, error.message);
    return null;
  }
}

export default { searchProducts, getProductDetails, storeName: STORE_NAME };
