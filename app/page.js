'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = '/api';
const popularQueries = [
  'iPhone 15 Pro Max',
  'Samsung S24 Ultra',
  'Infinix Note 40',
  'Redmi Note 13',
  'Power Bank',
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

  const [searchMode, setSearchMode] = useState('db');
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);

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
        
        if (data.needsLiveScrape) {
          setLiveLoading(true);
          // Fire and forget live scrape, then refetch
          fetch(`${API_BASE}/products/live?q=${encodeURIComponent(searchTerm)}&limit=50`)
            .then(res => res.json())
            .then(async (liveData) => {
              if (liveData.success) {
                // Re-fetch products to get the newly added items
                const newData = await fetchJson(`${API_BASE}/products?q=${encodeURIComponent(searchTerm)}&limit=100`);
                setProducts(newData.products || []);
                setMeta(`${newData.total || 0} result${newData.total === 1 ? '' : 's'}`);
              }
            })
            .catch(console.error)
            .finally(() => setLiveLoading(false));
        }
      }


    } catch (error) {
      console.error('Search error:', error);
      showToast(error.message || 'Search failed. Please try again.', 'error');
    } finally {
      setLoading(false);
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
            <span className="logo-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="30" height="30">
                <path d="M 5 35 L 35 35 L 30 39 L 5 39 Z" fill="#222"/>
                <path d="M 12 50 L 42 50 L 35 54 L 12 54 Z" fill="#222"/>
                <path d="M 18 65 L 35 65 L 30 69 L 18 69 Z" fill="#222"/>
                <path d="M 35 20 L 60 20 L 50 40 L 75 40 Q 82 40 80 50 L 70 70 L 40 70 Q 35 70 38 60 L 45 40 L 35 40 Z" fill="#369632"/>
                <circle cx="48" cy="80" r="7" fill="#222"/>
                <circle cx="48" cy="80" r="3" fill="#fff"/>
                <circle cx="68" cy="80" r="7" fill="#222"/>
                <circle cx="68" cy="80" r="3" fill="#fff"/>
              </svg>
            </span>
            <span className="logo-text">FLASHI</span>
          </a>
          <nav className={`nav ${menuOpen ? 'open' : ''}`}>
            <a href="/" className="nav-link" onClick={() => setMenuOpen(false)}>Home</a>
            <a href="#how-it-works" className="nav-link" onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="#stores-bar" className="nav-link" onClick={() => setMenuOpen(false)}>Stores</a>
            <a href="#contact" className="nav-link contact-nav-link" onClick={() => setMenuOpen(false)}>Contact Us</a>
          </nav>
          <a href="#contact" className="contact-btn" onClick={() => setMenuOpen(false)}>Contact Us</a>
          <button className={`hamburger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
      </header>

      <section className="hero" id="hero">
        <div className="container">
          <div className="hero-layout">
            <div className="hero-content">
              <div className="hero-badge">Search smarter, shop better</div>
              <h1 className="hero-title">
                FLASHI - Find The Best Lowest Prices Across Pakistan.
              </h1>
              <p className="hero-subtitle">
                Search any product and instantly compare prices from Pakistan's top stores in one place.
              </p>

              <div className="search-container" id="search-container">
                <div className="search-box" id="search-box">
                  <div className="search-icon" id="search-icon">🔎</div>
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
            <div className="loading-grid">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-image"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line short"></div>
                  <div className="skeleton-btn"></div>
                </div>
              ))}
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
                  <p className="results-meta">
                    {meta}
                    {liveLoading && (
                      <span className="live-loading-indicator">
                        <span className="live-dot"></span>
                        Scanning for more live deals...
                      </span>
                    )}
                  </p>
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
                        <a href={product.url} target="_blank" rel="noreferrer" className="product-visit-btn">
                          Visit Store →
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )
      )}



      <section className="how-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">How <span className="highlight-text">FLASHI</span> Works</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <div className="step-icon">🔍</div>
              <h3>Search any product</h3>
              <p>Type a product name or paste a URL to instantly find price matches.</p>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <div className="step-icon">⚡</div>
              <h3>Compare prices</h3>
              <p>See the best prices from multiple stores and choose the lowest offer.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="logo-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="30" height="30">
                  <path d="M 5 35 L 35 35 L 30 39 L 5 39 Z" fill="#222"/>
                  <path d="M 12 50 L 42 50 L 35 54 L 12 54 Z" fill="#222"/>
                  <path d="M 18 65 L 35 65 L 30 69 L 18 69 Z" fill="#222"/>
                  <path d="M 35 20 L 60 20 L 50 40 L 75 40 Q 82 40 80 50 L 70 70 L 40 70 Q 35 70 38 60 L 45 40 L 35 40 Z" fill="#369632"/>
                  <circle cx="48" cy="80" r="7" fill="#222"/>
                  <circle cx="48" cy="80" r="3" fill="#fff"/>
                  <circle cx="68" cy="80" r="7" fill="#222"/>
                  <circle cx="68" cy="80" r="3" fill="#fff"/>
                </svg>
              </span>
              <span className="logo-text">FLASHI</span>
              <p className="footer-tagline">Smarter price comparison for every shopper in Pakistan.</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} FLASHI. Compare prices with confidence.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
