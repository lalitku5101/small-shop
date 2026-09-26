(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  /* ============================================================
     SHOP INFO — loads name/phone/email/address from .env
  ============================================================ */
  async function loadShopInfo() {
    try {
      const res = await fetch('/api/shop');
      const data = await res.json();
      if (!data.success) return;

      const s = data.shop;
      const shopNameEl = $('#shopName');
      const footerNameEl = $('#footerShopName');
      const phoneEl = $('#infoPhone');
      const emailEl = $('#infoEmail');
      const addressEl = $('#infoAddress');

      if (shopNameEl) shopNameEl.textContent = s.name;
      if (footerNameEl) footerNameEl.textContent = s.name;
      if (phoneEl) phoneEl.textContent = s.phone || '—';
      if (emailEl) emailEl.textContent = s.email || '—';
      if (addressEl) addressEl.textContent = s.address || '—';

      document.title = s.name + ' — Your Neighborhood Store';
    } catch (err) {
      console.error('shop info error', err);
    }
  }

  /* ============================================================
     PRODUCTS — loads, filters, renders
  ============================================================ */
  let allProducts = [];
  let activeCategory = 'all';
  let searchTerm = '';

  async function loadProducts() {
    const grid = $('#productGrid');
    if (!grid) return;

    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (!data.success) throw new Error('API error');

      allProducts = data.products || [];
      renderCategories(data.categories || []);
      renderProducts();

      const statEl = $('#statProducts');
      if (statEl) statEl.textContent = allProducts.length + '+';
    } catch (err) {
      console.error('products error', err);
      grid.innerHTML = '<div class="loading">Could not load products. Please refresh.</div>';
    }
  }

  function renderCategories(categories) {
    const wrap = $('#categoryFilters');
    if (!wrap) return;
    wrap.innerHTML = '';

    function makeChip(label, value) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-chip' + (activeCategory === value ? ' active' : '');
      btn.textContent = label;

      btn.addEventListener('click', () => {
        activeCategory = value;
        wrap.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        renderProducts();
      });

      return btn;
    }

    wrap.appendChild(makeChip('All', 'all'));
    categories.forEach(c => wrap.appendChild(makeChip(c, c)));
  }

  function renderProducts() {
    const grid = $('#productGrid');
    const empty = $('#emptyState');
    if (!grid) return;

    let list = allProducts.slice();

    if (activeCategory !== 'all') {
      list = list.filter(p => p.category === activeCategory);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    grid.innerHTML = list.map(p => `
      <article class="product-card">
        <span class="cat-label">${escapeHTML(p.category)}</span>
        <h3>${escapeHTML(p.name)}</h3>
        <p class="desc">${escapeHTML(p.description || '')}</p>
        <div class="price-row">
          <span class="price">₹${escapeHTML(p.price)} <small>/ ${escapeHTML(p.unit)}</small></span>
          <span class="stock ${p.stock ? '' : 'out'}">${p.stock ? 'In stock' : 'Out of stock'}</span>
        </div>
      </article>
    `).join('');
  }

  /* ============================================================
     SEARCH — debounced input
  ============================================================ */
  const searchInput = $('#searchInput');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        searchTerm = e.target.value.trim();
        renderProducts();
      }, 180);
    });
  }

  /* ============================================================
     FORM SUBMISSION HELPER — used by both forms
  ============================================================ */
  async function submitForm(form, statusEl, url) {
    if (!form || !statusEl) return;

    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;

    const originalText = btn.textContent;

    statusEl.className = 'form-status';
    statusEl.textContent = 'Sending…';
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const payload = Object.fromEntries(new FormData(form).entries());

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        statusEl.className = 'form-status success';
        statusEl.textContent = '✓ ' + data.message;
        form.reset();
      } else {
        statusEl.className = 'form-status error';
        const msg = (data.errors && data.errors[0]) || data.error || 'Something went wrong.';
        statusEl.textContent = '✗ ' + msg;
      }
    } catch (err) {
      console.error('submit error', err);
      statusEl.className = 'form-status error';
      statusEl.textContent = '✗ Network error. Please try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  /* ============================================================
     REQUEST FORM
  ============================================================ */
  const requestForm = $('#requestForm');
  if (requestForm) {
    requestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm(requestForm, $('#requestStatus'), '/api/requests');
    });
  }

  /* ============================================================
     CONTACT FORM
  ============================================================ */
  const contactForm = $('#contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm(contactForm, $('#contactStatus'), '/api/contact');
    });
  }

  /* ============================================================
     FOOTER YEAR
  ============================================================ */
  const yearEl = $('#footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ============================================================
     INIT — kick everything off
  ============================================================ */
  loadShopInfo();
  loadProducts();

})();