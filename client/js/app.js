console.log('FLASHI app loaded - v2.0 - facewash fix');

import {
  createProductCard,
  createSkeletonCards,
  createPriceRangeBar,
  createReviewCard,
  createReviewsSummary,
  showToast,
  formatPrice,
  escapeHtml
} from './components.js';

// ---- Config ----
const API_BASE = '/api';

// ---- State ----
let currentProducts = [];
let currentQuery = '';
let currentView = 'grid';
let currentSort = 'price-asc';
let isLoading = false;

// ---- DOM Elements ----
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchBox = document.getElementById('search-box');
const heroSection = document.getElementById('hero');
const resultsSection = document.getElementById('results-section');
const loadingSection = document.getElementById('loading-section');
const productsGrid = document.getElementById('products-grid');
const priceRangeBar = document.getElementById('price-range-bar');
const resultsTitle = document.getElementById('results-title');
const resultsMeta = document.getElementById('results-meta');
const reviewsSection = document.getElementById('reviews-section');
const sortSelect = document.getElementById('sort-select');
const viewGridBtn = document.getElementById('view-grid');
const viewListBtn = document.getElementById('view-list');
const loadingStatus = document.getElementById('loading-status');

const adminLink = document.getElementById('admin-link');
const adminSection = document.getElementById('admin-section');
const adminBackBtn = document.getElementById('admin-back-btn');
const adminRefreshBtn = document.getElementById('admin-refresh-btn');
const adminQueryInput = document.getElementById('admin-query');
const adminStoreFilter = document.getElementById('admin-store-filter');
const adminSortSelect = document.getElementById('admin-sort');
const adminScrapeQuery = document.getElementById('admin-scrape-query');
const adminScrapeBtn = document.getElementById('admin-scrape-btn');
const adminSchedulerRefreshBtn = document.getElementById('admin-scheduler-refresh-btn');
const adminSchedulerRunBtn = document.getElementById('admin-scheduler-run-btn');
const adminSchedulerStatus = document.getElementById('admin-scheduler-status');
const adminTable = document.getElementById('admin-table');
const adminStatsGrid = document.getElementById('admin-stats-grid');
const adminProductsCount = document.getElementById('admin-products-count');

let adminProducts = [];

// ---- Init ----
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Mobile hamburger menu
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        nav.classList.remove('open');
      });
    });
  }

  // Contact modal
  const contactBtn = document.getElementById('contact-btn');
  const contactModal = document.getElementById('contact-modal');
  const modalClose = document.getElementById('modal-close');

  if (contactBtn && contactModal) {
    contactBtn.addEventListener('click', (e) => {
      e.preventDefault();
      contactModal.classList.remove('hidden');
    });

    modalClose.addEventListener('click', () => {
      contactModal.classList.add('hidden');
    });

    contactModal.addEventListener('click', (e) => {
      if (e.target === contactModal) contactModal.classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !contactModal.classList.contains('hidden')) {
        contactModal.classList.add('hidden');
      }
    });

    // Tabs
    contactModal.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        contactModal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        contactModal.querySelectorAll('[data-tab-content]').forEach(form => {
          form.classList.toggle('hidden', form.dataset.tabContent !== target);
        });
      });
    });

    // Form submissions
    const formReviews = document.getElementById('form-reviews');
    const formServices = document.getElementById('form-services');

    // Initialize EmailJS
    if (window.emailjs) {
      emailjs.init('5eOSAHGXf0eZoAFZW');
    }

    [formReviews, formServices].forEach(form => {
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('.form-submit');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        const isReview = form.id === 'form-reviews';
        const formName = isReview ? 'Review/Issue' : 'Service request';

        const templateParams = isReview
          ? {
              form_type: 'Review / Issue',
              name: form.querySelector('#ri-name').value,
              email: form.querySelector('#ri-email').value,
              type: form.querySelector('#ri-type').value,
              message: form.querySelector('#ri-message').value,
              time: new Date().toLocaleString(),
            }
          : {
              form_type: 'Service Request',
              name: form.querySelector('#sv-name').value,
              email: form.querySelector('#sv-email').value,
              phone: form.querySelector('#sv-phone').value || 'Not provided',
              type: form.querySelector('#sv-service').value,
              message: form.querySelector('#sv-details').value,
              time: new Date().toLocaleString(),
            };

        try {
          if (window.emailjs) {
            await emailjs.send('service_b6r9d4h', 'template_2o5t1bl', templateParams);
          }
          showToast(`${formName} submitted successfully! We'll get back to you soon.`, 'success');
          form.reset();
          contactModal.classList.add('hidden');
          // Reset tabs to first
          contactModal.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
          contactModal.querySelectorAll('[data-tab-content]').forEach(f => {
            f.classList.toggle('hidden', f.dataset.tabContent !== 'reviews');
          });
        } catch (err) {
          console.error('EmailJS error:', err?.text || err?.message || err);
          showToast('Failed to send. Please try again later.', 'error');
        } finally {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }
      });
    });
  }

  // Search event listeners
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  // Popular search hints
  document.querySelectorAll('.search-hint').forEach(hint => {
    hint.addEventListener('click', () => {
      searchInput.value = hint.dataset.query;
      handleSearch();
    });
  });

  // Sort
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderProducts(sortProducts(currentProducts));
  });

  // View toggle
  viewGridBtn.addEventListener('click', () => setView('grid'));
  viewListBtn.addEventListener('click', () => setView('list'));

  // Focus search on load
  setTimeout(() => searchInput.focus(), 500);

  if (adminBackBtn) {
    adminBackBtn.addEventListener('click', showSearchView);
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener('click', loadAdminProducts);
  }

  if (adminQueryInput) {
    adminQueryInput.addEventListener('input', loadAdminProducts);
  }

  if (adminStoreFilter) {
    adminStoreFilter.addEventListener('change', loadAdminProducts);
  }

  if (adminSortSelect) {
    adminSortSelect.addEventListener('change', loadAdminProducts);
  }

  if (adminScrapeBtn) {
    adminScrapeBtn.addEventListener('click', handleAdminScrape);
  }

  if (adminSchedulerRefreshBtn) {
    adminSchedulerRefreshBtn.addEventListener('click', loadSchedulerStatus);
  }

  if (adminSchedulerRunBtn) {
    adminSchedulerRunBtn.addEventListener('click', handleAdminRunScheduler);
  }

  window.addEventListener('popstate', () => {
    const adminMode = window.location.pathname === '/admin';
    if (adminMode) {
      openAdmin(false);
    } else {
      showSearchView(false);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  const adminMode = params.has('admin') || window.location.pathname === '/admin';

  if (adminMode) {
    openAdmin(false);
  } else if (q) {
    searchInput.value = q;
    handleSearch();
  }
}

// ---- Admin Helpers ----

function openAdmin(pushHistory = true) {
  heroSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  reviewsSection.classList.add('hidden');
  if (adminSection) adminSection.classList.remove('hidden');
  if (pushHistory && window.location.pathname !== '/admin') {
    window.history.pushState({}, '', '/admin');
  }
  populateAdminStores();
  loadAdminProducts();
}

function showSearchView(pushHistory = true) {
  heroSection.classList.remove('hidden');
  resultsSection.classList.remove('hidden');
  reviewsSection.classList.remove('hidden');
  if (adminSection) adminSection.classList.add('hidden');
  if (!pushHistory) return;
  const url = new URL(window.location);
  url.pathname = '/';
  if (currentQuery) {
    url.searchParams.set('q', currentQuery);
  } else {
    url.search = '';
  }
  window.history.pushState({}, '', url.toString());
}

async function populateAdminStores() {
  try {
    const data = await apiCall(`${API_BASE}/stores`);
    if (!adminStoreFilter) return;
    adminStoreFilter.innerHTML = '<option value="">All stores</option>' +
      data.stores.map(store => `<option value="${store.name}">${store.name}</option>`).join('');
  } catch (err) {
    console.error('Failed to load store list:', err);
  }
}

async function loadAdminProducts() {
  if (!adminSection || adminSection.classList.contains('hidden')) return;
  const query = adminQueryInput?.value.trim() || '';
  const store = adminStoreFilter?.value || '';
  const sort = adminSortSelect?.value || 'created-desc';

  try {
    const params = new URLSearchParams({
      q: query,
      store,
      sort,
      limit: '100',
    });

    const data = await apiCall(`${API_BASE}/products?${params.toString()}`);
    adminProducts = data.products || [];
    if (adminProductsCount) {
      adminProductsCount.textContent = `${data.total || adminProducts.length} items`;
    }
    renderAdminProducts(adminProducts);
    await loadAdminStats();
    await loadSchedulerStatus();
  } catch (err) {
    console.error('Admin products load failed:', err);
    showToast('Unable to load admin products.', 'error');
  }
}

async function loadAdminStats() {
  try {
    const stats = await apiCall(`${API_BASE}/admin/stats`);
    if (!adminStatsGrid) return;
    adminStatsGrid.innerHTML = `
      <div class="admin-stat-card">
        <span>Total products</span>
        <strong>${stats.totalProducts}</strong>
      </div>
      <div class="admin-stat-card">
        <span>Total stores</span>
        <strong>${stats.totalStores}</strong>
      </div>
      <div class="admin-stat-card">
        <span>Last scrape</span>
        <strong>${new Date(stats.latestScrape).toLocaleString()}</strong>
      </div>
    `;
  } catch (err) {
    console.error('Admin stats load failed:', err);
  }
}

function formatSchedulerStatus(status) {
  if (!status) return 'Scheduler status unavailable.';

  const lines = [];
  lines.push(`Mode: ${status.isRunning ? 'Running' : 'Idle'}`);
  lines.push(`Next run: ${status.nextRun ? new Date(status.nextRun).toLocaleString() : 'Not scheduled'}`);
  lines.push(`Interval: every ${status.intervalMinutes} minutes`);
  lines.push(`Queries: ${status.queries?.length || 0}`);

  if (status.lastRunResult) {
    const lastRun = status.lastRunResult;
    lines.push(`Last run: ${lastRun.timestamp ? new Date(lastRun.timestamp).toLocaleString() : 'unknown'}`);
    lines.push(`Last status: ${lastRun.status}`);
    if (typeof lastRun.totalScraped === 'number') lines.push(`Scraped: ${lastRun.totalScraped}`);
    if (typeof lastRun.totalSaved === 'number') lines.push(`Saved: ${lastRun.totalSaved}`);
    if (typeof lastRun.totalUpdated === 'number') lines.push(`Updated: ${lastRun.totalUpdated}`);
    if (lastRun.error) lines.push(`Error: ${lastRun.error}`);
  }

  return lines.join(' • ');
}

async function loadSchedulerStatus() {
  if (!adminSchedulerStatus) return;
  try {
    const status = await apiCall(`${API_BASE}/admin/jobs/status`);
    adminSchedulerStatus.textContent = formatSchedulerStatus(status);
  } catch (err) {
    console.error('Failed to load scheduler status:', err);
    adminSchedulerStatus.textContent = 'Unable to load scheduler status.';
  }
}

async function handleAdminRunScheduler() {
  if (!adminSchedulerRunBtn) return;

  adminSchedulerRunBtn.disabled = true;
  adminSchedulerRunBtn.textContent = 'Running...';

  try {
    const result = await fetch(`${API_BASE}/admin/jobs/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await result.json();
    if (!result.ok) {
      throw new Error(data.error || `HTTP ${result.status}`);
    }

    showToast(`Scheduler run complete. Saved ${data.totalSaved || 0} products.`, 'success');
    if (adminSchedulerStatus) {
      adminSchedulerStatus.textContent = formatSchedulerStatus(data);
    }
    await loadAdminProducts();
  } catch (err) {
    console.error('Scheduler run failed:', err);
    showToast(err.message || 'Scheduler run failed.', 'error');
  } finally {
    adminSchedulerRunBtn.disabled = false;
    adminSchedulerRunBtn.textContent = 'Run scheduler';
  }
}

function renderAdminProducts(products) {
  if (!adminTable) return;
  if (!products || products.length === 0) {
    adminTable.innerHTML = '<div class="admin-empty">No stored products found.</div>';
    return;
  }

  adminTable.innerHTML = products.map(product => `
    <div class="admin-row">
      <div class="admin-row-title">
        <a href="${product.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.title)}</a>
        <span class="admin-badge">${escapeHtml(product.store)}</span>
      </div>
      <div class="admin-row-meta">
        <span>${formatPrice(product.price)}</span>
        <span>${product.rating ? product.rating.toFixed(1) : 'N/A'} ★</span>
        <span>${product.reviewCount || 0} reviews</span>
        <span>${new Date(product.scrapedAt).toLocaleString()}</span>
      </div>
    </div>
  `).join('');
}

async function handleAdminScrape() {
  const query = adminScrapeQuery?.value.trim();
  if (!query || query.length < 2) {
    showToast('Enter a query to scrape.', 'warning');
    return;
  }

  adminScrapeBtn.disabled = true;
  adminScrapeBtn.textContent = 'Scraping...';

  try {
    const response = await fetch(`${API_BASE}/admin/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, limit: 12 }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Scrape failed');
    }

    showToast(`Saved ${result.scraped || 0} products to the database.`, 'success');
    await loadAdminProducts();
  } catch (err) {
    console.error('Admin scrape failed:', err);
    showToast(err.message || 'Scrape failed.', 'error');
  } finally {
    adminScrapeBtn.disabled = false;
    adminScrapeBtn.textContent = 'Scrape now';
  }
}

// ---- Search Handler ----
async function handleSearch() {
  const query = searchInput.value.trim();

  if (!query) {
    showToast('Please enter a product name or URL', 'warning');
    searchInput.focus();
    return;
  }

  if (query.length < 2) {
    showToast('Search query must be at least 2 characters', 'warning');
    return;
  }

  if (isLoading) return;

  currentQuery = query;

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('q', query);
  window.history.pushState({}, '', url);

  // Determine if URL or search
  const isUrl = query.startsWith('http://') || query.startsWith('https://');

  showLoading(true);

  try {
    let data;

    if (isUrl) {
      // Product URL lookup
      loadingStatus.textContent = 'Fetching product details...';
      data = await apiCall(`${API_BASE}/product?url=${encodeURIComponent(query)}`);

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.product) {
        // Supported store URL — show main product + alternatives
        const products = [data.product, ...(data.alternatives || [])].filter(Boolean);
        currentProducts = products;
        showResults(products, data.product.title || query);
      } else {
        // Non-store URL (image, random page) — show search results from extracted name
        currentProducts = data.products || [];
        const label = data.extractedQuery || query;
        const meta = [];
        if (data.totalResults) meta.push(`${data.totalResults} results`);
        if (data.storesSearched?.length) meta.push(`from ${data.storesSearched.join(', ')}`);
        if (data.extractedQuery) meta.push(`• Detected: "${data.extractedQuery}"`);
        showResults(currentProducts, label, meta.join(' '));
      }
    } else {
      // Text search against stored products in the database
      animateLoadingStores();
      data = await apiCall(`${API_BASE}/products?q=${encodeURIComponent(query)}&limit=100`);

      if (data.error) {
        throw new Error(data.error);
      }

      currentProducts = data.products || [];

      const meta = [];
      if (data.total) meta.push(`${data.total} results`);
      if (data.page) meta.push(`page ${data.page}`);

      showResults(data.products || [], query, meta.join(' '));
    }

    // Fetch reviews
    fetchReviews(currentQuery);

  } catch (error) {
    console.error('Search error:', error);
    showToast(error.message || 'Search failed. Please try again.', 'error');
    showLoading(false);
  }
}

// ---- API ----
async function apiCall(url) {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const data = JSON.parse(text);
      errorMessage = data.error || data.message || errorMessage;
    } catch (parseError) {
      if (text && text.trim().length > 0) {
        errorMessage = text.trim();
      }
    }
    throw new Error(errorMessage);
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    throw new Error('Invalid JSON response from server');
  }
}

// ---- Display Functions ----
function showLoading(show) {
  isLoading = show;
  searchBtn.disabled = show;

  if (show) {
    resultsSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');
    heroSection.style.paddingBottom = '0';
  } else {
    loadingSection.classList.add('hidden');
  }
}

function showResults(products, query, metaText = '') {
  showLoading(false);

  if (!products || products.length === 0) {
    resultsSection.classList.remove('hidden');
    resultsTitle.textContent = `No results for "${query}"`;
    resultsMeta.textContent = 'Try a different search term or check the URL';
    productsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
        <h3 style="margin-bottom: 8px;">No products found</h3>
        <p style="color: var(--text-secondary);">Try searching for something like "iPhone 16" or "Samsung Galaxy S25"</p>
      </div>
    `;
    priceRangeBar.innerHTML = '';
    return;
  }

  // Compact hero after search
  heroSection.style.paddingBottom = '20px';

  resultsSection.classList.remove('hidden');
  resultsTitle.textContent = `Results for "${query}"`;
  resultsMeta.textContent = metaText;

  // Price range bar
  priceRangeBar.innerHTML = createPriceRangeBar(products);

  // Render sorted products
  renderProducts(sortProducts(products));

  // Smooth scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function renderProducts(products) {
  productsGrid.className = `products-grid ${currentView === 'list' ? 'list-view' : ''}`;

  const cheapestPrice = products.length > 0
    ? Math.min(...products.map(p => p.price || Infinity))
    : null;

  productsGrid.innerHTML = products.map((product, i) => {
    const isCheapest = product.price === cheapestPrice && i === products.findIndex(p => p.price === cheapestPrice);
    return createProductCard(product, i, isCheapest);
  }).join('');
}

function sortProducts(products) {
  const sorted = [...products];

  switch (currentSort) {
    case 'price-asc':
      sorted.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
      break;
    case 'price-desc':
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'reviews':
      sorted.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
      break;
  }

  return sorted;
}

function setView(view) {
  currentView = view;
  viewGridBtn.classList.toggle('active', view === 'grid');
  viewListBtn.classList.toggle('active', view === 'list');
  productsGrid.className = `products-grid ${view === 'list' ? 'list-view' : ''}`;
}

// ---- Reviews ----
async function fetchReviews(query) {
  try {
    const data = await apiCall(`${API_BASE}/reviews?q=${encodeURIComponent(query)}`);

    if (data.reviews && data.reviews.length > 0) {
      const summaryEl = document.getElementById('reviews-summary');
      const listEl = document.getElementById('reviews-list');
      const sectionEl = document.getElementById('reviews-section');
      
      if (summaryEl) summaryEl.innerHTML = createReviewsSummary(data.reviews);
      if (listEl) listEl.innerHTML = data.reviews.map((review, i) => createReviewCard(review, i)).join('');
      if (sectionEl) sectionEl.style.display = 'block';
    }
  } catch (error) {
    console.error('Reviews fetch error:', error);
  }
}

// ---- Loading Animation ----
function animateLoadingStores() {
  const storeEls = document.querySelectorAll('.loading-store');
  const storeNames = ['Daraz', 'PriceOye', 'Mega.pk', 'Highfy', 'OLX', 'Shophive', 'Naheed'];
  let currentIndex = 0;

  const interval = setInterval(() => {
    if (!isLoading) {
      clearInterval(interval);
      return;
    }

    storeEls.forEach(el => el.classList.remove('active'));

    if (currentIndex < storeEls.length) {
      storeEls[currentIndex].classList.add('active');
      loadingStatus.textContent = `Searching ${storeNames[currentIndex]}...`;
      currentIndex++;
    } else {
      loadingStatus.textContent = 'Comparing prices across all stores...';
      storeEls.forEach(el => el.classList.add('active'));
      clearInterval(interval);
    }
  }, 800);
}

// ---- Browser back/forward ----
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q) {
    searchInput.value = q;
    handleSearch();
  }
});
