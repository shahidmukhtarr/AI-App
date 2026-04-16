import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRequestHeaders, parsePrice, sanitizeText, truncate } from '../utils/helpers.js';

const STORE_NAME = 'HomeShopping';
const STORE_URL = 'https://homeshopping.pk';
const STORE_COLOR = '#000000';

export async function searchProducts(query, limit = 20) {
  try {
    // API endpoint might be easier, but let's do a basic HTML fallback
    const searchUrl = `${STORE_URL}/search.php?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const products = [];

    $('.product-box, .ProductBox').each((i, el) => {
      if (products.length >= limit) return false;

      const $el = $(el);
      const nameEl = $el.find('h5 a, .product-title a').first();
      const title = sanitizeText(nameEl.text() || $el.find('.product-title').text());
      const link = nameEl.attr('href') || $el.find('a').first().attr('href') || '';
      
      const imgEl = $el.find('img').first();
      const image = imgEl.attr('src') || imgEl.attr('data-src') || '';

      const priceText = $el.find('.price, .ActualPrice').first().text();
      const price = parsePrice(priceText);
      const inStock = !($el.text().toLowerCase().includes('out of stock'));

      if (title && price) {
        products.push({
          title,
          price,
          originalPrice: null,
          discount: null,
          image: image.startsWith('http') ? image : `${STORE_URL}${image}`,
          url: link.startsWith('http') ? link : `${STORE_URL}${link}`,
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

    const title = sanitizeText($('h1').text() || $('title').text());
    const image = $('meta[property="og:image"]').attr('content') || '';
    
    const priceText = $('.price, .ActualPrice').first().text();
    const price = parsePrice(priceText);
    
    const description = truncate(sanitizeText($('.description').text()), 300);
    const inStock = !($('body').text().toLowerCase().includes('out of stock'));

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
