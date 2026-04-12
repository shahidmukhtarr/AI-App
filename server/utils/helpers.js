// User-Agent rotation to avoid detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getRequestHeaders() {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };
}

/**
 * Parse price string to number (handles PKR formatting)
 * "Rs. 45,999" → 45999
 * "PKR 1,23,456" → 123456
 */
export function parsePrice(priceStr) {
  if (priceStr == null) return null;
  // Remove currency symbols, especially 'Rs.' which contains a dot that breaksparseFloat
  let cleaned = String(priceStr).replace(/Rs\.?/gi, '').replace(/PKR/gi, '');
  // Remove commas
  cleaned = cleaned.replace(/,/g, '');
  // Remove any other non-digit/dot characters
  cleaned = cleaned.replace(/[^\d.]/g, '');

  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Format number as PKR price
 * 45999 → "Rs. 45,999"
 */
export function formatPrice(num) {
  if (num == null) return 'N/A';
  return `Rs. ${num.toLocaleString('en-PK')}`;
}

/**
 * Validate and identify store from URL
 */
export function identifyStore(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes('daraz.pk')) return 'daraz';
    if (hostname.includes('priceoye.pk')) return 'priceoye';
    if (hostname.includes('mega.pk')) return 'mega';
    if (hostname.includes('highfy.pk')) return 'highfy';
    if (hostname.includes('ishopping.pk')) return 'ishopping';
    if (hostname.includes('shophive.com')) return 'shophive';
    if (hostname.includes('homeshopping.pk')) return 'homeshopping';
    if (hostname.includes('olx.com.pk')) return 'olx';
    if (hostname.includes('naheed.pk')) return 'naheed';

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if string is a valid URL
 */
export function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize text — remove extra whitespace, HTML entities
 */
export function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text, maxLen = 100) {
  if (!text || text.length <= maxLen) return text;
  return text.substring(0, maxLen).trim() + '...';
}

/**
 * Delay helper for rate limiting scraping
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe async wrapper
 */
export async function safeAsync(fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    console.error('safeAsync error:', err.message);
    return fallback;
  }
}
