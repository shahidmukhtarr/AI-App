'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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
    case 'created-desc':
      return list.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    case 'created-asc':
      return list.sort((a, b) => new Date(a.scrapedAt) - new Date(b.scrapedAt));
    case 'store':
      return list.sort((a, b) => (a.store || '').localeCompare(b.store || ''));
    default:
      return list;
  }
}

function toastClass(type) {
  return `toast ${type}`;
}

export default function AdminPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [sort, setSort] = useState('created-desc');
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [scheduler, setScheduler] = useState(null);
  const [scrapeQuery, setScrapeQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const filteredProducts = useMemo(() => sortProducts(products, sort), [products, sort]);

  useEffect(() => {
    loadProducts();
    loadStats();
    loadScheduler();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(message, type = 'info') {
    setToast({ message, type });
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Request failed');
    }
    return data;
  }

  async function loadProducts() {
    setLoading(true);
    try {
      const url = new URL('/api/products', window.location.href);
      if (query.trim()) url.searchParams.set('q', query.trim());
      if (storeFilter) url.searchParams.set('store', storeFilter);
      url.searchParams.set('sort', sort);
      url.searchParams.set('limit', '100');
      const data = await fetchJson(url.toString());
      setProducts(data.products || []);
    } catch (error) {
      console.error(error);
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const data = await fetchJson('/api/admin/stats');
      setStats(data);
    } catch (error) {
      console.error(error);
      showToast(error.message, 'error');
    }
  }

  async function loadScheduler() {
    try {
      const data = await fetchJson('/api/admin/jobs/status');
      setScheduler(data);
    } catch (error) {
      console.error(error);
      showToast(error.message, 'error');
    }
  }

  async function handleManualScrape() {
    const term = scrapeQuery.trim();
    if (term.length < 2) {
      showToast('Enter a valid scrape query.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchJson('/api/admin/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: term, limit: 40 }),
      });
      showToast(`Scrape completed: ${data.scraped} items saved.`, 'success');
      setScrapeQuery('');
      loadProducts();
      loadStats();
    } catch (error) {
      console.error(error);
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRunScheduler() {
    setLoading(true);
    try {
      const data = await fetchJson('/api/admin/jobs/run', { method: 'POST' });
      setScheduler(data);
      showToast('Scheduler run completed.', 'success');
      loadProducts();
      loadStats();
    } catch (error) {
      console.error(error);
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const storeOptions = useMemo(() => {
    const uniqueStores = new Set(products.map((product) => product.store).filter(Boolean));
    return Array.from(uniqueStores).sort();
  }, [products]);

  return (
    <main>
      <header className="header">
        <div className="container">
          <a href="/" className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">FLASHI Admin</span>
          </a>
          <div className="admin-header-actions">
            <button className="button button-secondary" type="button" onClick={() => router.push('/')}>
              Back to search
            </button>
          </div>
        </div>
      </header>

      <section className="results-section" style={{ paddingTop: '90px' }}>
        <div className="container">
          <div className="results-header admin-panel-header">
            <div className="results-info">
              <h2 className="results-title">Hidden Admin Backoffice</h2>
              <p className="results-meta">Manage stored products, scheduler status and scraper jobs.</p>
            </div>
            <div className="results-controls admin-panel-controls">
              <button className="button button-secondary" type="button" onClick={loadScheduler} disabled={loading}>
                Refresh scheduler
              </button>
              <button className="button button-primary" type="button" onClick={handleRunScheduler} disabled={loading}>
                Run scheduler
              </button>
            </div>
          </div>

          {toast && (
            <div id="toast-container">
              <div className={toastClass(toast.type)}>{toast.message}</div>
            </div>
          )}

          <div className="admin-grid">
            <div className="admin-card admin-card-wide">
              <label htmlFor="admin-query">Search stored products</label>
              <input
                id="admin-query"
                className="input-field"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onBlur={loadProducts}
                placeholder="Search title, store, or URL"
              />
            </div>
            <div className="admin-card">
              <label htmlFor="admin-store-filter">Filter by store</label>
              <select
                id="admin-store-filter"
                className="input-field"
                value={storeFilter}
                onChange={(event) => {
                  setStoreFilter(event.target.value);
                  setTimeout(loadProducts, 0);
                }}>
                <option value="">All stores</option>
                {storeOptions.map((store) => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </div>
            <div className="admin-card">
              <label htmlFor="admin-sort">Sort by</label>
              <select
                id="admin-sort"
                className="input-field"
                value={sort}
                onChange={(event) => setSort(event.target.value)}>
                <option value="created-desc">Newest first</option>
                <option value="created-asc">Oldest first</option>
                <option value="price-asc">Price low → high</option>
                <option value="price-desc">Price high → low</option>
                <option value="rating">Best rating</option>
                <option value="reviews">Most reviews</option>
                <option value="store">Store name</option>
              </select>
            </div>
            <div className="admin-card admin-scrape-card">
              <label htmlFor="admin-scrape-query">Manual scrape query</label>
              <div className="admin-scrape-row">
                <input
                  id="admin-scrape-query"
                  className="input-field"
                  type="text"
                  value={scrapeQuery}
                  onChange={(event) => setScrapeQuery(event.target.value)}
                  placeholder="e.g. iPhone 15"
                />
                <button className="button button-primary" type="button" onClick={handleManualScrape} disabled={loading}>
                  Scrape now
                </button>
              </div>
            </div>
            <div className="admin-card admin-scheduler-card">
              <label>Scheduler status</label>
              <div className="admin-scheduler-row" style={{ flexDirection: 'column', gap: '10px' }}>
                <div className="admin-scheduler-summary" style={{ width: '100%' }}>
                  {scheduler ? (
                    <div>
                      <div><strong>Status:</strong> {scheduler.isRunning ? 'Running' : 'Idle'}</div>
                      <div><strong>Last run:</strong> {scheduler.lastRun || 'Never'}</div>
                      <div><strong>Next run:</strong> {scheduler.nextRun || 'Pending'}</div>
                      <div><strong>Interval:</strong> {scheduler.intervalMinutes} minutes</div>
                      <div><strong>Queries:</strong> {scheduler.queries?.join(', ')}</div>
                    </div>
                  ) : (
                    <div>No scheduler data loaded yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="admin-stats" id="admin-stats-grid">
            <div className="admin-card">
              <h3>Total stored products</h3>
              <p>{stats?.totalProducts ?? '—'}</p>
            </div>
            <div className="admin-card">
              <h3>Stores indexed</h3>
              <p>{stats?.totalStores ?? '—'}</p>
            </div>
            <div className="admin-card">
              <h3>Latest scraped</h3>
              <p>{stats?.latestScrape || 'N/A'}</p>
            </div>
          </div>

          <div className="admin-table-wrapper">
            <div className="admin-table-header">
              <h3>Stored products</h3>
              <span>{filteredProducts.length} items</span>
            </div>
            <div className="admin-table admin-product-list">
              {filteredProducts.length === 0 ? (
                <div className="empty-state">No stored products match the current filters.</div>
              ) : (
                filteredProducts.map((product) => (
                  <div key={product.id} className="admin-product-card">
                    <div className="admin-product-main">
                      <div className="store-badge" style={{ background: product.storeColor || '#6366f1' }}>{product.store}</div>
                      <a className="product-title" href={product.url} target="_blank" rel="noreferrer">
                        {product.title}
                      </a>
                      <div className="product-price-row">
                        <span className="product-price">{formatPrice(product.price)}</span>
                        {product.originalPrice && product.originalPrice > product.price ? (
                          <span className="product-original-price">{formatPrice(product.originalPrice)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="admin-product-meta">
                      <span>{product.reviewCount || 0} reviews</span>
                      <span>{product.rating?.toFixed(1) ?? 'N/A'} ★</span>
                      <span>{product.inStock !== false ? 'In stock' : 'Out of stock'}</span>
                      <span>{new Date(product.scrapedAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
