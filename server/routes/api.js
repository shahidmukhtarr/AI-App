import { Router } from 'express';
import { searchAllStores, getProductFromUrl, getReviews, getSupportedStores } from '../services/scraperEngine.js';
import { isValidUrl } from '../utils/helpers.js';

const router = Router();

/**
 * GET /api/search?q=<query>
 * Search products across all stores
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required. Use ?q=your+search+term' });
    }

    if (q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    // Always fetch fresh results
    const results = await searchAllStores(q.trim(), parseInt(limit) || 8);

    res.json({ ...results, cached: false });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/product?url=<url>
 * Get product details from a specific store URL
 */
router.get('/product', async (req, res, next) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Product URL is required. Use ?url=https://...' });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const result = await getProductFromUrl(url);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json({ ...result, cached: false });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reviews?q=<query>
 * Get product reviews
 */
router.get('/reviews', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required for reviews' });
    }

    const reviews = await getReviews(q.trim());

    res.json({ ...reviews, cached: false });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stores
 * List supported stores
 */
router.get('/stores', (req, res) => {
  res.json({
    stores: getSupportedStores(),
    total: getSupportedStores().length,
  });
});

/**
 * GET /api/health
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
