'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = '/api';
const popularQueries = [
  'iPhone 15',
  'Samsung Galaxy S24',
  'AirPods Pro',
  'MacBook Air',
  'PlayStation 5',
];

function formatPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return `Rs. ${Math.round(Number(value)).toLocaleString('en-PK')}`;
}

function sortProducts(products, sortKey) {
  const list = [...products];

  switch (sortKey) {
    case 'price-asc':
      return list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    case 'price-desc':
      return list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case 'rating':
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case 'reviews':
      return list.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    default:
      return list;
  }
}

function getPriceStats(products) {
  const prices = products.map((product) => product.price).filter((value) => value != null && !Number.isNaN(Number(value)));
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, savings: max - min };
}

function toastClass(type) {
  return `toast ${type}`;
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState('price-asc');
  const [view, setView] = useState('grid');
  const [meta, setMeta] = useState('');
  const [toast, setToast] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [showReviews, setShowReviews] = useState(false);
  const [searchMode, setSearchMode] = useState('db');

  const sortedProducts = useMemo(() => sortProducts(products, sortKey), [products, sortKey]);
  const priceStats = useMemo(() => getPriceStats(sortedProducts), [sortedProducts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setQuery(q);
      handleSearch(q, false);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(message, type = 'info') {
    setToast({ message, type });
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) {
      let error = `HTTP ${response.status}`;
      try {
        const data = JSON.parse(text);
        error = data.error || data.message || error;
      } catch {}
      throw new Error(error);
    }
    return text ? JSON.parse(text) : {};
  }

  async function handleSearch(value = query, pushHistory = true) {
    const searchTerm = value.trim();
    if (!searchTerm) {
      showToast('Please enter a product name or URL', 'warning');
      return;
    }

    if (searchTerm.length < 2) {
      showToast('Search query must be at least 2 characters', 'warning');
      return;
    }

    const isUrl = searchTerm.startsWith('http://') || searchTerm.startsWith('https://');
    setLoading(true);
    setProducts([]);
    setMeta('');
    setShowReviews(false);
    setReviews([]);
    setSearchMode(isUrl ? 'url' : 'db');

    if (pushHistory) {
      const url = new URL(window.location);
      url.searchParams.set('q', searchTerm);
      window.history.pushState({}, '', url.toString());
    }

    try {
      if (isUrl) {
        const data = await fetchJson(`${API_BASE}/product?url=${encodeURIComponent(searchTerm)}`);
        if (data.error) throw new Error(data.error);
        const productsList = [data.product, ...(data.alternatives || [])].filter(Boolean);
        setProducts(productsList);
        setMeta(data.product?.title ? `Product details for "${data.product.title}"` : 'Product lookup result');
      } else {
        const data = await fetchJson(`${API_BASE}/products?q=${encodeURIComponent(searchTerm)}&limit=100`);
        setProducts(data.products || []);
        setMeta(`${data.total || 0} result${data.total === 1 ? '' : 's'}`);
      }

      fetchReviews(searchTerm);
    } catch (error) {
      console.error('Search error:', error);
      showToast(error.message || 'Search failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchReviews(searchTerm) {
    try {
      const data = await fetchJson(`${API_BASE}/reviews?q=${encodeURIComponent(searchTerm)}`);
      setReviews(data.reviews || []);
      setShowReviews(true);
    } catch (err) {
      console.error('Review fetch failed:', err);
      setShowReviews(false);
    }
  }

  function handleHintClick(value) {
    setQuery(value);
    handleSearch(value);
  }

  return (
    <main>
      <header className="header">
        <div className="container">
          <a href="/" className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">FLASHI</span>
          </a>
          <nav className="nav">
            <a href="/" className="nav-link">Home</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#stores-bar" className="nav-link">Stores</a>
          </nav>
          <a href="#contact" className="contact-btn">Contact Us</a>
        </div>
      </header>

      <section className="hero" id="hero">
        <div className="container">
          <div className="hero-layout">
            <div className="hero-content">
              <div className="hero-badge">→ The smartest way to shop Online</div>
              <h1 className="hero-title">
                Find the <span className="highlight-text">lowest price</span> across Pakistan's top stores
              </h1>
              <p className="hero-subtitle">
                Compare prices from Daraz, PriceOye, Highfy & many more — all in one place.
              </p>

              <div className="search-container" id="search-container">
                <div className="search-box" id="search-box">
                  <div className="search-icon" id="search-icon">🔍</div>
                  <input
                    type="text"
                    id="search-input"
                    className="search-input"
                    placeholder="Search product or paste any URL..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                  />
                  <button className="search-btn" type="button" onClick={() => handleSearch()} disabled={loading}>
                    Compare Prices
                  </button>
                </div>
                <div className="search-hints">
                  <span className="search-hint-label">Popular:</span>
                  {popularQueries.map((item) => (
                    <button key={item} className="search-hint" type="button" onClick={() => handleHintClick(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {toast && (
        <div id="toast-container">
          <div className={toastClass(toast.type)}>{toast.message}</div>
        </div>
      )}

      {loading ? (
        <section className="loading-section">
          <div className="container">
            <div className="loading-content">
              <div className="loading-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <h3 className="loading-title">Searching across saved product data...</h3>
              <p className="loading-subtitle">Please wait while we fetch the latest entries.</p>
            </div>
          </div>
        </section>
      ) : (
        products.length > 0 && (
          <section className="results-section" id="results-section">
            <div className="container">
              <div className="results-header" id="results-header">
                <div className="results-info">
                  <h2 className="results-title">Results for "{query}"</h2>
                  <p className="results-meta">{meta}</p>
                </div>
                <div className="results-controls">
                  <div className="sort-group">
                    <label className="sort-label">Sort by</label>
                    <select className="sort-select" value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                      <option value="price-asc">Price: Low → High</option>
                      <option value="price-desc">Price: High → Low</option>
                      <option value="rating">Best Rating</option>
                      <option value="reviews">Most Reviews</option>
                    </select>
                  </div>
                  <div className="view-toggle">
                    <button className={`view-btn ${view === 'grid' ? 'active' : ''}`} type="button" onClick={() => setView('grid')}>
                      Grid
                    </button>
                    <button className={`view-btn ${view === 'list' ? 'active' : ''}`} type="button" onClick={() => setView('list')}>
                      List
                    </button>
                  </div>
                </div>
              </div>

              {priceStats && (
                <div className="price-range-bar">
                  <div className="price-range-header">
                    <span className="price-range-label">Price Range</span>
                    <div className="price-range-values">
                      <span className="price-range-value price-low">Lowest: {formatPrice(priceStats.min)}</span>
                      <span className="price-range-value price-high">Highest: {formatPrice(priceStats.max)}</span>
                      <span className="price-range-value" style={{ color: '#588157' }}>
                        Save up to {formatPrice(priceStats.savings)}
                      </span>
                    </div>
                  </div>
                  <div className="price-bar-track">
                    <div className="price-bar-fill" style={{ width: '100%' }}></div>
                  </div>
                </div>
              )}

              <div className={`products-grid ${view === 'list' ? 'list-view' : ''}`}>
                {sortedProducts.map((product, index) => (
                  <article
                    className={`product-card ${priceStats?.min === product.price ? 'cheapest' : ''}`}
                    key={`${product.id}-${index}`}>
                    <div className="store-badge" style={{ background: product.storeColor || '#6366f1' }}>
                      {product.store}
                    </div>
                    <div className="product-image-wrap">
                      {product.image ? (
                        <img src={product.image} alt={product.title} className="product-image" />
                      ) : (
                        <div className="product-image-placeholder">📱</div>
                      )}
                    </div>
                    <div className="product-info">
                      <a href={product.url} target="_blank" rel="noreferrer" className="product-title">
                        {product.title}
                      </a>
                      <div className="product-price-row">
                        <span className="product-price">{formatPrice(product.price)}</span>
                        {product.originalPrice && product.originalPrice > product.price ? (
                          <span className="product-original-price">{formatPrice(product.originalPrice)}</span>
                        ) : null}
                      </div>
                      <div className="product-rating">
                        <span className="rating-text">{product.rating?.toFixed(1) ?? 'N/A'} ★</span>
                        <span className="review-count">({product.reviewCount || 0} reviews)</span>
                      </div>
                      <div className="product-footer">
                        <div className="product-footer-top">
                          <span className="product-store-name">
                            <span className="product-store-dot" style={{ background: product.storeColor || '#6366f1' }}></span>
                            {product.store}
                          </span>
                          <span className={product.inStock !== false ? 'stock-badge in-stock' : 'stock-badge out-of-stock'}>
                            {product.inStock !== false ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </div>
                        <div className="product-actions">
                          <a href={product.url} target="_blank" rel="noreferrer" className="product-visit-btn">
                            Visit Store
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )
      )}

      {showReviews && reviews.length > 0 && (
        <section className="results-section" id="reviews-section">
          <div className="container">
            <h2 className="results-title">Customer Reviews</h2>
            <div className="products-grid list-view" style={{ gap: '16px' }}>
              {reviews.map((review, index) => (
                <article className="review-card" key={`${review.author}-${index}`}>
                  <div className="review-header">
                    <div className="review-author-info">
                      <div className="review-avatar">{review.author.split(' ').map((word) => word[0]).join('').toUpperCase()}</div>
                      <div>
                        <div className="review-author">{review.author}</div>
                        <div className="review-date">{new Date(review.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                      </div>
                    </div>
                    <div className="review-badges">
                      {review.verified && <span className="verified-badge">✓ Verified Purchase</span>}
                      <span className="review-store-badge" style={{ background: review.storeColor || '#6366f1' }}>{review.store}</span>
                    </div>
                  </div>
                  <div className="product-rating" style={{ marginBottom: 8 }}>
                    <span className="rating-text">{review.rating}/5</span>
                  </div>
                  <div className="review-title-text">{review.title}</div>
                  <p className="review-text">{review.text}</p>
                  <div className="review-helpful">👍 {review.helpful || 0} people found this helpful</div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="how-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">How <span className="highlight-text">FLASHI</span> Works</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <div className="step-icon">🔍</div>
              <h3>Search Any Product</h3>
              <p>Enter a product name or paste a store URL to find price details instantly.</p>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <div className="step-icon">⚡</div>
              <h3>Compare Prices</h3>
              <p>FLASHI reads stored product data from Supabase and shows matched items fast.</p>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <div className="step-icon">💾</div>
              <h3>Background Scraper</h3>
              <p>Scraper jobs run in the background and keep the database updated with fresh products.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="logo-icon">⚡</span>
              <span className="logo-text">FLASHI</span>
              <p className="footer-tagline">The smartest way to shop online in Pakistan.</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} FLASHI. Prices are saved in Supabase and refreshed by the scheduler.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
