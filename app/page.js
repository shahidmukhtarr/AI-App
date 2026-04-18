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

const LIVE_WAIT_MESSAGE = 'Gathering Information Please Wait For Few Seconds...';
const DB_WAIT_MESSAGE = 'Gathering Information Please Wait For Few Seconds...';

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
  const [statusMessage, setStatusMessage] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: 'General Inquiry', message: '' });
  const [submitting, setSubmitting] = useState(false);

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
    setLiveLoading(false);
    setStatusMessage(isUrl ? 'Fetching product details...' : DB_WAIT_MESSAGE);
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
          setStatusMessage(LIVE_WAIT_MESSAGE);
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
            .finally(() => {
              setLiveLoading(false);
              setStatusMessage('');
            });
        }
      }


    } catch (error) {
      console.error('Search error:', error);
      showToast(error.message || 'Search failed. Please try again.', 'error');
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      showToast('Thank you for your message! We will get back to you soon.', 'success');
      setContactForm({ name: '', email: '', subject: 'General Inquiry', message: '' });
    } catch (error) {
      console.error('Contact error:', error);
      showToast(error.message || 'Failed to send message. Please try again.', 'error');
    } finally {
      setSubmitting(false);
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

                <div className="trust-section">
                  <div className="trust-label"><h2>Most Popular Stores</h2></div>
                  <div className="trust-logos">
                    <div className="trust-logo-card">
                      <img src="https://www.google.com/s2/favicons?domain=daraz.pk&sz=128" alt="Daraz" className="brand-logo-img" />
                      <span className="brand-logo-name">Daraz</span>
                    </div>
                    <div className="trust-logo-card">
                      <img src="https://www.google.com/s2/favicons?domain=priceoye.pk&sz=128" alt="PriceOye" className="brand-logo-img" />
                      <span className="brand-logo-name">PriceOye</span>
                    </div>
                    <div className="trust-logo-card">
                      <img src="https://www.google.com/s2/favicons?domain=mega.pk&sz=128" alt="Mega.pk" className="brand-logo-img" />
                      <span className="brand-logo-name">Mega.pk</span>
                    </div>
                    <div className="trust-logo-card">
                      <img src="https://www.google.com/s2/favicons?domain=highfy.pk&sz=128" alt="Highfy" className="brand-logo-img" />
                      <span className="brand-logo-name">Highfy</span>
                    </div>
                  </div>
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
            <div className="loading-info" style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
              <div className="live-loading-indicator" style={{ margin: '0 auto', justifyContent: 'center' }}>
                <span className="live-dot"></span>
                {statusMessage}
              </div>
            </div>
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
                    {(loading || liveLoading) && statusMessage && (
                      <span className="live-loading-indicator">
                        <span className="live-dot"></span>
                        {statusMessage}
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

      <section className="contact-section" id="contact">
        <div className="container">
          <div className="contact-layout">
            <div className="contact-info-plus">
              <div className="hero-badge">Get in touch</div>
              <h2 className="section-title" style={{ textAlign: 'left', margin: '0 0 var(--spacing-md) 0' }}>
                We'd love to hear <span className="highlight-text">your feedback</span>
              </h2>
              <p className="contact-desc">
                Have a question about FLASHI? Want to suggest a new store or report a bug? 
                Our team is here to help you get the best out of your shopping experience.
              </p>
              <div className="contact-features">
                <div className="contact-feature">
                  <div className="cf-icon">📮</div>
                  <div className="cf-text">
                    <h4>Direct Feedback</h4>
                    <p>Your suggestions help us improve FLASHI every day.</p>
                  </div>
                </div>
                <div className="contact-feature">
                  <div className="cf-icon">⚡</div>
                  <div className="cf-text">
                    <h4>Fast Response</h4>
                    <p>We typically reply within 24 hours of receiving your message.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="contact-form-container">
              <form className="contact-form" onSubmit={handleContactSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Your Name</label>
                    <input 
                      type="text" 
                      placeholder="John Doe" 
                      required 
                      value={contactForm.name}
                      onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="john@example.com" 
                      required 
                      value={contactForm.email}
                      onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <select 
                    value={contactForm.subject}
                    onChange={(e) => setContactForm({...contactForm, subject: e.target.value})}
                  >
                    <option>General Inquiry</option>
                    <option>Store Suggestion</option>
                    <option>Bug Report</option>
                    <option>Feedback</option>
                    <option>Partnership</option>
                    <option>Services</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Message</label>
                  <textarea 
                    rows="4" 
                    placeholder="Tell us what's on your mind..." 
                    required
                    value={contactForm.message}
                    onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                  ></textarea>
                </div>
                <button className="submit-btn" type="submit" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
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
