/**
 * PricePK — UI Component Generators
 * Reusable component functions for building the UI
 */

/**
 * Generate star rating SVGs
 */
export function renderStars(rating, size = 14) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.3;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  const starSvg = (type) => {
    const fill = type === 'empty' ? 'none' : 'currentColor';
    const cls = `star ${type}`;
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>`;
  };

  return `<div class="stars">
    ${''.padEnd(fullStars).split('').map(() => starSvg('filled')).join('')}
    ${hasHalf ? starSvg('half') : ''}
    ${''.padEnd(Math.max(0, emptyStars)).split('').map(() => starSvg('empty')).join('')}
  </div>`;
}

/**
 * Format price in PKR
 */
export function formatPrice(num) {
  if (num == null || isNaN(num)) return 'N/A';
  return `Rs. ${Math.round(num).toLocaleString('en-PK')}`;
}

/**
 * Generate a product card
 */
export function createProductCard(product, index, isCheapest = false) {
  const delay = Math.min(index * 60, 400);
  const hasDiscount = product.originalPrice && product.originalPrice > product.price;
  const discountPercent = hasDiscount 
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return `
    <article class="product-card ${isCheapest ? 'cheapest' : ''}" 
             style="animation-delay: ${delay}ms"
             data-price="${product.price || 0}"
             data-rating="${product.rating || 0}"
             data-reviews="${product.reviewCount || 0}">
      
      <div class="store-badge" style="background: ${product.storeColor || '#6366f1'}">
        ${product.store}
      </div>

        <div class="product-image-wrap">
          ${product.image 
            ? `<img src="${product.image}" alt="${product.title}" class="product-image" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23666\\' stroke-width=\\'1\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><polyline points=\\'21 15 16 10 5 21\\'></polyline></svg>';">` 
            : `<div class="product-image-placeholder">📱</div>`}
          ${isCheapest ? `<div class="store-badge" style="background: #588157">Best Deal</div>` : ''}
        </div>

      <div class="product-info">
        <a href="${product.url}" target="_blank" rel="noopener noreferrer" class="product-title" title="${escapeHtml(product.title)}">
          ${escapeHtml(product.title)}
        </a>

        <div class="product-price-row">
          <span class="product-price">${formatPrice(product.price)}</span>
          ${hasDiscount ? `<span class="product-original-price">${formatPrice(product.originalPrice)}</span>` : ''}
          ${discountPercent ? `<span class="product-discount">-${discountPercent}%</span>` : ''}
        </div>

        <div class="product-rating">
          ${renderStars(product.rating || 0)}
          <span class="rating-text">${(product.rating || 0).toFixed(1)}</span>
          ${product.reviewCount ? `<span class="review-count">(${product.reviewCount.toLocaleString()} reviews)</span>` : ''}
        </div>

        <div class="product-footer">
          <div class="product-footer-top">
            <span class="product-store-name">
              <span class="product-store-dot" style="background: ${product.storeColor || '#6366f1'}"></span>
              ${product.store}
            </span>
            <span class="${product.inStock !== false ? 'stock-badge in-stock' : 'stock-badge out-of-stock'}">
              ${product.inStock !== false ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>
          <div class="product-actions">
            <a href="${product.url}" target="_blank" rel="noopener noreferrer" class="product-visit-btn">
              Visit Store
            </a>
          </div>
        </div>
      </div>
    </article>
  `;
}

/**
 * Generate skeleton loading cards
 */
export function createSkeletonCards(count = 6) {
  return Array(count).fill('').map((_, i) => `
    <div class="skeleton-card" style="animation-delay: ${i * 100}ms">
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line price"></div>
      </div>
    </div>
  `).join('');
}

/**
 * Generate price range bar
 */
export function createPriceRangeBar(products) {
  if (!products || products.length === 0) return '';

  const prices = products.map(p => p.price).filter(p => p != null && !isNaN(p));
  if (prices.length === 0) return '';

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const savings = maxPrice - minPrice;

  return `
    <div class="price-range-header">
      <span class="price-range-label">Price Range</span>
      <div class="price-range-values">
        <span class="price-range-value price-low">Lowest: ${formatPrice(minPrice)}</span>
        <span class="price-range-value price-high">Highest: ${formatPrice(maxPrice)}</span>
        ${savings > 0 ? `<span class="price-range-value" style="color: #588157">Save up to ${formatPrice(savings)}</span>` : ''}
      </div>
    </div>
    <div class="price-bar-track">
      <div class="price-bar-fill" style="width: 100%"></div>
    </div>
  `;
}

/**
 * Generate review card
 */
export function createReviewCard(review, index) {
  const delay = Math.min(index * 80, 500);
  const initials = review.author.split(' ').map(w => w[0]).join('').toUpperCase();

  return `
    <div class="review-card" style="animation-delay: ${delay}ms">
      <div class="review-header">
        <div class="review-author-info">
          <div class="review-avatar">${initials}</div>
          <div>
            <div class="review-author">${escapeHtml(review.author)}</div>
            <div class="review-date">${formatDate(review.date)}</div>
          </div>
        </div>
        <div class="review-badges">
          ${review.verified ? '<span class="verified-badge">✓ Verified Purchase</span>' : ''}
          <span class="review-store-badge" style="background: ${review.storeColor || '#6366f1'}">${review.store}</span>
        </div>
      </div>
      <div class="product-rating" style="margin-bottom: 8px">
        ${renderStars(review.rating)}
        <span class="rating-text">${review.rating}/5</span>
      </div>
      ${review.title ? `<div class="review-title-text">${escapeHtml(review.title)}</div>` : ''}
      <p class="review-text">${escapeHtml(review.text)}</p>
      <div class="review-helpful">👍 ${review.helpful || 0} people found this helpful</div>
    </div>
  `;
}

/**
 * Generate reviews summary
 */
export function createReviewsSummary(reviews) {
  if (!reviews || reviews.length === 0) return '';

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const distribution = [0, 0, 0, 0, 0]; // 1-5 stars

  reviews.forEach(r => {
    const bucket = Math.min(4, Math.max(0, Math.round(r.rating) - 1));
    distribution[bucket]++;
  });

  const maxCount = Math.max(...distribution);

  return `
    <div class="summary-score">
      <div class="summary-number">${avgRating.toFixed(1)}</div>
      ${renderStars(avgRating, 18)}
      <div class="summary-label">${reviews.length} reviews</div>
    </div>
    <div class="summary-bars">
      ${distribution.reverse().map((count, i) => {
        const starNum = 5 - i;
        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return `
          <div class="summary-bar-row">
            <span class="summary-bar-label">${starNum}★</span>
            <div class="summary-bar-track">
              <div class="summary-bar-fill" style="width: ${pct}%"></div>
            </div>
            <span class="summary-bar-count">${count}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Create toast notification
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = { error: '❌', success: '✅', info: 'ℹ️', warning: '⚠️' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(message)}`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* Utility functions */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}
