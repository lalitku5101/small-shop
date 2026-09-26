'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ============================================================
   FILE PATHS
============================================================ */
const DATA_DIR = path.join(__dirname, 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

/* ============================================================
   SEED DATA
============================================================ */
function seedProducts() {
  return [
    { id: 'p1',  name: 'Basmati Rice',         category: 'Grains',        price: 120, unit: 'kg',   stock: true,  description: 'Premium aged basmati rice.' },
    { id: 'p2',  name: 'Wheat Flour (Atta)',   category: 'Grains',        price: 45,  unit: 'kg',   stock: true,  description: 'Fresh ground whole wheat flour.' },
    { id: 'p3',  name: 'Toor Dal',             category: 'Pulses',        price: 140, unit: 'kg',   stock: true,  description: 'Unpolished premium toor dal.' },
    { id: 'p4',  name: 'Sunflower Oil',        category: 'Oil & Ghee',    price: 155, unit: 'L',    stock: true,  description: 'Refined sunflower cooking oil.' },
    { id: 'p5',  name: 'Amul Butter',          category: 'Dairy',         price: 58,  unit: '500g', stock: true,  description: 'Salted butter, fresh stock.' },
    { id: 'p6',  name: 'Tata Tea Gold',        category: 'Beverages',     price: 285, unit: '500g', stock: true,  description: 'Rich blend of Assam tea leaves.' },
    { id: 'p7',  name: 'Colgate Toothpaste',   category: 'Personal Care', price: 95,  unit: '200g', stock: true,  description: 'Strong teeth, fresh breath.' },
    { id: 'p8',  name: 'Surf Excel Detergent', category: 'Household',     price: 220, unit: '2kg',  stock: true,  description: 'Tough on stains, gentle on clothes.' },
    { id: 'p9',  name: 'Maggi Noodles',        category: 'Snacks',        price: 14,  unit: 'pack', stock: true,  description: '2-minute masala noodles.' },
    { id: 'p10', name: 'Parle-G Biscuits',     category: 'Snacks',        price: 10,  unit: 'pack', stock: true,  description: 'The classic glucose biscuits.' }
    
  ];
}

/* ============================================================
   FILE HELPERS
============================================================ */
async function ensureDataFiles() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch (_) {}

  await ensureFile(REQUESTS_FILE, '[]');
  await ensureFile(MESSAGES_FILE, '[]');
  await ensureFile(PRODUCTS_FILE, JSON.stringify(seedProducts(), null, 2));
}

async function ensureFile(filePath, defaultContent) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, 'utf8');
  }
}

async function readJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/* ============================================================
   MIDDLEWARE
============================================================ */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' }
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions. Try again later.' }
});

/* ============================================================
   UTILITIES
============================================================ */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value, maxLen = 500) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLen);
}

function makeId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ============================================================
   STATIC FILES
============================================================ */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/* ============================================================
   API: SHOP INFO
============================================================ */
app.get('/api/shop', (req, res) => {
  res.json({
    success: true,
    shop: {
      name: process.env.SHOP_NAME || 'Our Shop',
      phone: process.env.SHOP_PHONE || '',
      email: process.env.SHOP_EMAIL || '',
      address: process.env.SHOP_ADDRESS || ''
    }
  });
});

/* ============================================================
   API: PRODUCTS
============================================================ */
app.get('/api/products', apiLimiter, async (req, res) => {
  try {
    const products = await readJSON(PRODUCTS_FILE);
    const category = String(req.query.category || 'all');
    const q = String(req.query.q || '').toLowerCase().trim();

    let filtered = products;
    if (category && category !== 'all') {
      filtered = filtered.filter(p => p.category === category);
    }
    if (q) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }

    const categories = [...new Set(products.map(p => p.category))];

    res.json({
      success: true,
      count: filtered.length,
      categories,
      products: filtered
    });
  } catch (err) {
    console.error('Products error:', err);
    res.status(500).json({ success: false, error: 'Could not load products.' });
  }
});

/* ============================================================
   API: ITEM REQUEST
============================================================ */
app.post('/api/requests', formLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const phone = clean(req.body.phone, 20);
    const email = clean(req.body.email, 120).toLowerCase();
    const item = clean(req.body.item, 200);
    const quantity = clean(req.body.quantity, 60);
    const notes = clean(req.body.notes, 800);

    const errors = [];
    if (name.length < 2) errors.push('Please enter your name.');
    if (phone.length < 7) errors.push('Please enter a valid phone number.');
    if (email && !EMAIL_RE.test(email)) errors.push('Email looks invalid.');
    if (item.length < 2) errors.push('Please tell us what item you need.');

    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const requests = await readJSON(REQUESTS_FILE);
    const record = {
      id: makeId('req'),
      name, phone, email, item, quantity, notes,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    requests.unshift(record);
    if (requests.length > 2000) requests.length = 2000;
    await writeJSON(REQUESTS_FILE, requests);

    console.log(`🛒 New request: "${item}" from ${name} (${phone})`);

    res.status(201).json({
      success: true,
      message: `Thanks ${name}! We'll call you at ${phone} about "${item}".`,
      id: record.id
    });
  } catch (err) {
    console.error('Request error:', err);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

/* ============================================================
   API: CONTACT FORM
============================================================ */
app.post('/api/contact', formLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const email = clean(req.body.email, 120).toLowerCase();
    const phone = clean(req.body.phone, 20);
    const message = clean(req.body.message, 1500);

    const errors = [];
    if (name.length < 2) errors.push('Please enter your name.');
    if (!EMAIL_RE.test(email)) errors.push('Please enter a valid email.');
    if (message.length < 5) errors.push('Please write a message.');

    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const messages = await readJSON(MESSAGES_FILE);
    const record = {
      id: makeId('msg'),
      name, email, phone, message,
      createdAt: new Date().toISOString()
    };

    messages.unshift(record);
    if (messages.length > 2000) messages.length = 2000;
    await writeJSON(MESSAGES_FILE, messages);

    console.log(`📩 New message from ${name} (${email})`);

    res.status(201).json({ success: true, message: "Message sent! We'll reply soon." });
  } catch (err) {
    console.error('Contact error:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

/* ============================================================
   ADMIN AUTH MIDDLEWARE
============================================================ */
function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') || req.query.token || '';
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  next();
}

/* ============================================================
   API: ADMIN
============================================================ */
app.get('/api/admin/requests', requireAdmin, async (req, res) => {
  const requests = await readJSON(REQUESTS_FILE);
  res.json({ success: true, count: requests.length, requests });
});

app.get('/api/admin/messages', requireAdmin, async (req, res) => {
  const messages = await readJSON(MESSAGES_FILE);
  res.json({ success: true, count: messages.length, messages });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const [requests, messages, products] = await Promise.all([
    readJSON(REQUESTS_FILE),
    readJSON(MESSAGES_FILE),
    readJSON(PRODUCTS_FILE)
  ]);

  res.json({
    success: true,
    stats: {
      totalRequests: requests.length,
      newRequests: requests.filter(r => r.status === 'new').length,
      totalMessages: messages.length,
      totalProducts: products.length,
      uptime: Math.floor(process.uptime())
    }
  });
});

/* ============================================================
   API: HEALTH
============================================================ */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    time: new Date().toISOString()
  });
});

/* ============================================================
   404 FOR API
============================================================ */
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API route not found.' });
});

/* ============================================================
   SPA FALLBACK
============================================================ */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ============================================================
   GLOBAL ERROR HANDLER
============================================================ */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Something went wrong.' });
});

/* ============================================================
   START SERVER
============================================================ */
(async () => {
  try {
    await ensureDataFiles();
    app.listen(PORT, () => {
      console.log('');
      console.log(`🏪  ${process.env.SHOP_NAME || 'Shop'} is running`);
      console.log(`    Store : http://localhost:${PORT}`);
      console.log(`    Admin : http://localhost:${PORT}/admin.html?token=${process.env.ADMIN_TOKEN || 'mysecret12345'}`);
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();