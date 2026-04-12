import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRequestHeaders, parsePrice, sanitizeText } from '../utils/helpers.js';

const STORE_NAME = 'Naheed';
const STORE_URL = 'https://www.naheed.pk';
const STORE_COLOR = '#e31837';

/**
 * Search products on Naheed.pk (Magento 2 store)
 * Naheed.pk uses Magento 2 with server-side rendered search results.
 */
export async function searchProducts(query, limit = 20) {
  try {
    const searchUrl = `${STORE_URL}/catalogsearch/result/?q=${encodeURIComponent(query)}`;

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
    const $ = cheerio.load(html);
    const products = [];

    // Magento 2 product list items
    // Common selectors: .product-item, .product-items li, .products-grid .product-item
    const productSelectors = [
      '.product-item',
      '.products-grid .item',
      '.products.list .item',
      'li.product-item',
      '.product-items > li',
    ];

    let productEls = $([]);
    for (const selector of productSelectors) {
      productEls = $(selector);
      if (productEls.length > 0) break;
    }

    productEls.each((i, el) => {
      if (products.length >= limit) return false;

      const $el = $(el);

      // Product name
      const nameEl = $el.find('.product-item-link, .product-name a, .product-item-name a, a.product-item-link');
      const name = nameEl.text().trim() || $el.find('a').first().text().trim();

      // Product URL
      const link = nameEl.attr('href') || $el.find('a').first().attr('href') || '';

      // Product image
      const image = $el.find('.product-image-photo').attr('src') ||
                     $el.find('.product-image-photo').attr('data-src') ||
                     $el.find('img').attr('src') ||
                     $el.find('img').attr('data-src') || '';

      // Price extraction - Magento uses .price-box with .price elements
      const priceBox = $el.find('.price-box');
      const specialPrice = priceBox.find('.special-price .price').text();
      const normalPrice = priceBox.find('.normal-price .price, .regular-price .price, .price').first().text();
      const oldPrice = priceBox.find('.old-price .price').text();

      let price = parsePrice(specialPrice) || parsePrice(normalPrice);
      let originalPrice = parsePrice(oldPrice);

      // If no price found from structured elements, try text matching
      if (!price) {
        const fullText = $el.text();
        const priceMatches = fullText.match(/Rs\.?\s*([\d,]+)/gi) || [];
        if (priceMatches.length >= 1) price = parsePrice(priceMatches[0]);
        if (priceMatches.length >= 2) originalPrice = parsePrice(priceMatches[1]);
        if (originalPrice && price && originalPrice < price) {
          [price, originalPrice] = [originalPrice, price];
        }
      }

      // Discount
      let discount = null;
      if (price && originalPrice && originalPrice > price) {
        const pct = Math.round(((originalPrice - price) / originalPrice) * 100);
        discount = `-${pct}%`;
      }

      if (name && price) {
        products.push({
          title: sanitizeText(name),
          price,
          originalPrice,
          discount,
          image: image.startsWith('http') ? image : image ? `${STORE_URL}${image}` : '',
          url: link.startsWith('http') ? link : `${STORE_URL}${link}`,
          rating: 0,
          reviewCount: 0,
          store: STORE_NAME,
          storeUrl: STORE_URL,
          storeColor: STORE_COLOR,
          inStock: !$el.find('.out-of-stock, .outofstock, .unavailable').length,
        });
      }
    });

    // Fallback: try JSON-LD structured data if no products found from HTML
    if (products.length === 0) {
      const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse($(script).html());
          const items = data?.itemListElement || (Array.isArray(data) ? data : [data]);
          for (const item of items) {
            const product = item.item || item;
            if (product['@type'] === 'Product' && product.name) {
              const price = parsePrice(product.offers?.price || product.offers?.lowPrice);
              if (!price) continue;
              products.push({
                title: sanitizeText(product.name),
                price,
                originalPrice: parsePrice(product.offers?.highPrice),
                discount: null,
                image: Array.isArray(product.image) ? product.image[0] : product.image || '',
                url: product.url || product.offers?.url || searchUrl,
                rating: parseFloat(product.aggregateRating?.ratingValue) || 0,
                reviewCount: parseInt(product.aggregateRating?.reviewCount) || 0,
                store: STORE_NAME,
                storeUrl: STORE_URL,
                storeColor: STORE_COLOR,
                inStock: product.offers?.availability?.includes('InStock') ?? true,
              });
              if (products.length >= limit) break;
            }
          }
        } catch {
          // continue
        }
      }
    }

    // Fallback: try Magento GraphQL API
    if (products.length === 0) {
      try {
        const gqlResponse = await axios.post(
          `${STORE_URL}/graphql`,
          {
            query: `{
              products(search: "${query.replace(/"/g, '\\"')}", pageSize: ${limit}) {
                items {
                  name
                  sku
                  url_key
                  small_image { url }
                  price_range {
                    minimum_price {
                      regular_price { value }
                      final_price { value }
                      discount { percent_off }
                    }
                  }
                }
              }
            }`
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Store': 'default',
              ...getRequestHeaders(),
            },
            timeout: 15000,
          }
        );

        const gqlItems = gqlResponse.data?.data?.products?.items || [];
        for (const item of gqlItems.slice(0, limit)) {
          const priceInfo = item.price_range?.minimum_price;
          const price = priceInfo?.final_price?.value;
          const originalPrice = priceInfo?.regular_price?.value;
          if (!price) continue;

          const discountPct = priceInfo?.discount?.percent_off;
          products.push({
            title: sanitizeText(item.name || ''),
            price,
            originalPrice: originalPrice > price ? originalPrice : null,
            discount: discountPct > 0 ? `-${Math.round(discountPct)}%` : null,
            image: item.small_image?.url || '',
            url: item.url_key ? `${STORE_URL}/${item.url_key}` : searchUrl,
            rating: 0,
            reviewCount: 0,
            store: STORE_NAME,
            storeUrl: STORE_URL,
            storeColor: STORE_COLOR,
            inStock: true,
          });
        }
      } catch {
        // GraphQL not available, that's ok
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
 * Get product details from a Naheed.pk URL
 */
export async function getProductDetails(url) {
  try {
    const response = await axios.get(url, {
      headers: getRequestHeaders(),
      timeout: 15000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Try JSON-LD structured data
    const jsonLd = $('script[type="application/ld+json"]').toArray();
    for (const script of jsonLd) {
      try {
        const data = JSON.parse($(script).html());
        if (data['@type'] === 'Product' && data.name) {
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
      } catch {
        // continue
      }
    }

    // Fallback: meta tags + HTML
    const title = $('meta[property="og:title"]').attr('content') ||
                  $('.page-title span').text() ||
                  $('h1.product-name').text() ||
                  $('title').text();

    const image = $('meta[property="og:image"]').attr('content') ||
                  $('.product.media img').attr('src') || '';

    const priceText = $('.price-box .price').first().text();
    const price = parsePrice(priceText);

    const oldPriceText = $('.price-box .old-price .price').text();
    const originalPrice = parsePrice(oldPriceText);

    const description = $('meta[property="og:description"]').attr('content') ||
                         $('.product.attribute.description .value').text() || '';

    if (title && price) {
      return {
        title: sanitizeText(title),
        price,
        originalPrice,
        image,
        url,
        rating: 0,
        reviewCount: 0,
        store: STORE_NAME,
        storeUrl: STORE_URL,
        storeColor: STORE_COLOR,
        description: sanitizeText(description),
        inStock: !$('.out-of-stock, .unavailable').length,
      };
    }

    return null;
  } catch (error) {
    console.error(`[${STORE_NAME}] Product details error:`, error.message);
    return null;
  }
}
