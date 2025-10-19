// server.js - Unified server with multi-source support
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const config = require('./config');
const { DataProviderFactory } = require('./dataProviders');

const app = express();
const PORT = config.getPort();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize multi-source data provider
const dataProvider = DataProviderFactory.createProvider();

// Session management
const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function requireAuth(req, res, next) {
  if (!dataProvider.isAuthRequired()) {
    req.user = { id: 'guest', email: 'guest' };
    return next();
  }

  const sessionId = req.headers['x-session-id'];
  if (sessionId && sessions.has(sessionId)) {
    req.user = sessions.get(sessionId);
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadSitemap() {
  const jsPath = path.join(__dirname, 'sitemap.js');
  const jsonPath = path.join(__dirname, 'sitemap.json');
  
  try {
    delete require.cache[require.resolve(jsPath)];
    const mod = require(jsPath);
    console.log('Loaded custom sitemap.js');
    return typeof mod === 'function' ? await mod() : mod;
  } catch (e) {
    if (e?.code !== 'MODULE_NOT_FOUND') console.error('loadSitemap js error:', e?.stack);
  }
  
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    console.log('Loaded custom sitemap.json');
    return JSON.parse(raw);
  } catch (e) {
    if (e?.code !== 'ENOENT') console.error('loadSitemap json error:', e?.stack);
  }
  
  console.log('No custom sitemap found, generating from data sources...');
  return await generateDynamicSitemap();
}

async function generateDynamicSitemap() {
  try {
    const groupedTables = await dataProvider.getAvailableTablesGroupedBySource();
    
    const sitemap = {
      pages: [
        {
          title: 'Home',
          object: 'home',
          children: []
        }
      ]
    };

    // Create a section for each data source
    groupedTables.forEach(source => {
      const sourceNode = {
        title: source.sourceName,
        url: '#',
        children: source.tables.map(table => ({
          title: table.title,
          object: table.name,
          sourceId: source.sourceId, // Store source ID
          children: []
        }))
      };
      sitemap.pages.push(sourceNode);
    });
    
    console.log(`Generated dynamic sitemap with ${groupedTables.length} data sources`);
    return sitemap;
  } catch (error) {
    console.error('Error generating dynamic sitemap:', error);
    return { pages: [{ title: 'Home', object: 'home', children: [] }] };
  }
}

function buildSidebarHtml(items = []) {
  function buildNodes(it) {
    if (!Array.isArray(it) || it.length === 0) return '';
    let s = '<ul class="sitemap-list">';
    for (const item of it) {
      const title = escapeHtml(item.title || item.name || 'Unnamed');
      const url = item.url ? escapeHtml(item.url) : null;
      const object = item.object ? escapeHtml(item.object) : (item.url?.includes('?object=') ? escapeHtml(new URL(item.url, 'http://example').searchParams.get('object')) : null);
      const sourceId = item.sourceId ? escapeHtml(item.sourceId) : '';
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      s += '<li class="sitemap-item">';
      s += `<span class="sitemap-label"${object ? ` data-object="${object}"` : ''}${sourceId ? ` data-source="${sourceId}"` : ''}${url && !object ? ` data-url="${url}"` : ''} role="button" tabindex="0">${title}</span>`;
      if (hasChildren) {
        s += ` <button class="sitemap-toggle" aria-expanded="false">▶</button>`;
        s += `<div class="sitemap-children d-none">` + buildNodes(item.children) + `</div>`;
      }
      s += '</li>';
    }
    s += '</ul>';
    return s;
  }

  const refreshBtn = '<button class="refresh-sitemap-btn" onclick="window.refreshSitemap()" title="Refresh sitemap">↻</button>';
  const script = `<script src="/app.js"></script>`;
  return `<button class="hamburger-btn" onclick="toggleMobileMenu()" aria-label="Toggle menu">☰</button><div class="sidebar-overlay"></div><aside class="sidebar-wrapper">${refreshBtn}${buildNodes(items)}</aside>` + script;
}

function buildLoginPage() {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Login</title><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}.login-card{background:white;padding:40px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);width:100%;max-width:400px}.login-title{font-size:28px;font-weight:700;color:#333;margin:0 0 8px 0;text-align:center}.login-subtitle{font-size:14px;color:#666;margin:0 0 32px 0;text-align:center}.form-group{margin-bottom:20px}.form-label{display:block;font-weight:600;color:#333;margin-bottom:8px;font-size:14px}.form-input{width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;transition:border-color 0.2s}.form-input:focus{outline:none;border-color:#667eea}.login-button{width:100%;padding:14px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:transform 0.2s}.login-button:hover{transform:translateY(-2px)}.login-button:active{transform:translateY(0)}.error-message{background:#fee;color:#c33;padding:12px;border-radius:8px;margin-bottom:20px;display:none;font-size:14px}.error-message.show{display:block}.signup-link{text-align:center;margin-top:20px;font-size:14px;color:#666}.signup-link a{color:#667eea;text-decoration:none;font-weight:600}.signup-link a:hover{text-decoration:underline}@media (max-width:480px){.login-card{padding:24px}.login-title{font-size:24px}}</style></head><body><div class="login-card"><h1 class="login-title">Welcome Back</h1><p class="login-subtitle">Sign in to access your data</p><div id="error" class="error-message"></div><form id="loginForm"><div class="form-group"><label class="form-label" for="email">Email</label><input type="email" id="email" class="form-input" placeholder="you@example.com" required autocomplete="email"></div><div class="form-group"><label class="form-label" for="password">Password</label><input type="password" id="password" class="form-input" placeholder="Enter your password" required autocomplete="current-password"></div><button type="submit" class="login-button">Sign In</button></form><div class="signup-link">Don't have an account? <a href="/register">Sign up</a></div></div><script>window.addEventListener('DOMContentLoaded',function(){const form=document.getElementById('loginForm');const errorDiv=document.getElementById('error');if(!form){console.error('Login form not found');return}form.addEventListener('submit',async(e)=>{e.preventDefault();const email=document.getElementById('email').value;const password=document.getElementById('password').value;errorDiv.classList.remove('show');try{const res=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await res.json();if(res.ok){localStorage.setItem('sessionId',data.sessionId);window.location.href='/?sessionId='+data.sessionId}else{errorDiv.textContent=data.error||'Login failed';errorDiv.classList.add('show')}}catch(err){errorDiv.textContent='Network error. Please try again.';errorDiv.classList.add('show')}})});</script></body></html>`;
}

function buildRegisterPage() {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Register</title><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}.register-card{background:white;padding:40px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);width:100%;max-width:400px}.register-title{font-size:28px;font-weight:700;color:#333;margin:0 0 8px 0;text-align:center}.register-subtitle{font-size:14px;color:#666;margin:0 0 32px 0;text-align:center}.form-group{margin-bottom:20px}.form-label{display:block;font-weight:600;color:#333;margin-bottom:8px;font-size:14px}.form-input{width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;transition:border-color 0.2s}.form-input:focus{outline:none;border-color:#667eea}.register-button{width:100%;padding:14px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:transform 0.2s}.register-button:hover{transform:translateY(-2px)}.register-button:active{transform:translateY(0)}.error-message{background:#fee;color:#c33;padding:12px;border-radius:8px;margin-bottom:20px;display:none;font-size:14px}.error-message.show{display:block}.success-message{background:#efe;color:#383;padding:12px;border-radius:8px;margin-bottom:20px;display:none;font-size:14px}.success-message.show{display:block}.login-link{text-align:center;margin-top:20px;font-size:14px;color:#666}.login-link a{color:#667eea;text-decoration:none;font-weight:600}.login-link a:hover{text-decoration:underline}.password-hint{font-size:12px;color:#999;margin-top:4px}@media (max-width:480px){.register-card{padding:24px}.register-title{font-size:24px}}</style></head><body><div class="register-card"><h1 class="register-title">Create Account</h1><p class="register-subtitle">Sign up to get started</p><div id="error" class="error-message"></div><div id="success" class="success-message"></div><form id="registerForm"><div class="form-group"><label class="form-label" for="email">Email</label><input type="email" id="email" class="form-input" placeholder="you@example.com" required autocomplete="email"></div><div class="form-group"><label class="form-label" for="password">Password</label><input type="password" id="password" class="form-input" placeholder="Create a password" required autocomplete="new-password" minlength="6"><div class="password-hint">Minimum 6 characters</div></div><div class="form-group"><label class="form-label" for="confirmPassword">Confirm Password</label><input type="password" id="confirmPassword" class="form-input" placeholder="Confirm your password" required autocomplete="new-password" minlength="6"></div><button type="submit" class="register-button">Create Account</button></form><div class="login-link">Already have an account? <a href="/">Sign in</a></div></div><script>window.addEventListener('DOMContentLoaded',function(){const form=document.getElementById('registerForm');const errorDiv=document.getElementById('error');const successDiv=document.getElementById('success');if(!form){console.error('Register form not found');return}form.addEventListener('submit',async(e)=>{e.preventDefault();const email=document.getElementById('email').value;const password=document.getElementById('password').value;const confirmPassword=document.getElementById('confirmPassword').value;errorDiv.classList.remove('show');successDiv.classList.remove('show');if(password!==confirmPassword){errorDiv.textContent='Passwords do not match';errorDiv.classList.add('show');return}if(password.length<6){errorDiv.textContent='Password must be at least 6 characters';errorDiv.classList.add('show');return}try{const res=await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await res.json();if(res.ok){successDiv.textContent='Account created successfully! Redirecting to login...';successDiv.classList.add('show');setTimeout(()=>{window.location.href='/'},2000)}else{errorDiv.textContent=data.error||'Registration failed';errorDiv.classList.add('show')}}catch(err){errorDiv.textContent='Network error. Please try again.';errorDiv.classList.add('show')}})});</script></body></html>`;
}

app.get('/', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    
    if (dataProvider.isAuthRequired() && (!sessionId || !sessions.has(sessionId))) {
      return res.send(buildLoginPage());
    }
    
    const sitemap = await loadSitemap();
    const items = Array.isArray(sitemap?.pages) ? sitemap.pages : Array.isArray(sitemap) ? sitemap : [];
    const sidebar = buildSidebarHtml(items);
    
    const sources = config.getEnabledSources();
    const sourceNames = sources.map(s => s.name).join(' & ');
    
    const content = `<div class="home-page"><div class="home-header"><h1 class="home-title">Welcome to your dotConfig data driven application</h1><p class="home-subtitle">This is a modern web application for managing your data with ease</p><p class="home-datasource">Connected to ${sources.length} data source${sources.length > 1 ? 's' : ''}: ${sourceNames}</p></div><div class="home-content"><div class="home-section"><h2 class="section-title">Getting Started</h2><ul class="feature-list"><li>Select an item from the sidebar to view and manage data</li><li>Use the search box to filter records</li><li>Click "Add" to create new records</li><li>Click "Edit" to modify existing records</li><li>Click "Delete" to remove records</li><li>Click "Import CSV" to bulk import data</li></ul></div><div class="home-section"><h2 class="section-title">Features</h2><ul class="feature-list"><li><strong>Multi-Source Support:</strong> Access data from multiple sources</li><li><strong>CRUD Operations:</strong> Create, Read, Update, and Delete records</li><li><strong>CSV Import:</strong> Bulk import data from CSV files</li><li><strong>Search & Filter:</strong> Quickly find the data you need</li><li><strong>Pagination:</strong> Navigate through large datasets easily</li><li><strong>Responsive Design:</strong> Works on desktop, tablet, and mobile</li></ul></div></div></div>`;
    
    const logoutBtn = dataProvider.isAuthRequired() ? '<button class="logout-btn" onclick="logout()">Logout</button>' : '';
    
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>dotConfig Data App</title><link rel="stylesheet" href="/styles.css"><script>const SESSION_ID='${sessionId||''}';if(SESSION_ID)localStorage.setItem('sessionId',SESSION_ID);function logout(){localStorage.removeItem('sessionId');window.location.href='/logout'}</script></head><body data-datasource="Multi-Source">${sidebar}<main class="content-area">${logoutBtn}${content}</main></body></html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('<pre>Error: ' + escapeHtml(err.message) + '</pre>');
  }
});

app.get('/objectdata', requireAuth, async (req, res) => {
  const obj = req.query.object;
  const sourceId = req.query.source;
  const id = req.query.id;
  
  if (!obj) return res.status(400).json({ error: 'invalid object' });
  if (!sourceId) return res.status(400).json({ error: 'invalid source' });
  
  try {
    if (id) {
      const result = await dataProvider.getRowById(sourceId, obj, id, req.user.id);
      res.json(result);
    } else {
      const result = await dataProvider.getTableData(sourceId, obj, req.user.id);
      res.json(result);
    }
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/lookupdata', requireAuth, async (req, res) => {
  const file = req.query.file;
  const sourceId = req.query.source;
  
  if (!file) return res.status(400).json({ error: 'invalid lookup file' });
  if (!sourceId) return res.status(400).json({ error: 'invalid source' });
  
  try {
    const result = await dataProvider.getLookupValues(sourceId, file, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Error fetching lookup data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/saveobject', requireAuth, async (req, res) => {
  const { object, source, id, row } = req.body || {};
  if (!object || !source || !id || !row) return res.status(400).json({ error: 'invalid input' });
  
  try {
    await dataProvider.updateRow(source, object, id, row, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/addobject', requireAuth, async (req, res) => {
  const { object, source, row } = req.body || {};
  if (!object || !source || !row) return res.status(400).json({ error: 'invalid input' });
  
  try {
    await dataProvider.insertRow(source, object, row, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error inserting:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/deleteobject', requireAuth, async (req, res) => {
  const { object, source, id } = req.body || {};
  if (!object || !source || !id) return res.status(400).json({ error: 'invalid input' });
  
  try {
    await dataProvider.deleteRow(source, object, id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/import-csv', requireAuth, upload.single('csvFile'), async (req, res) => {
  try {
    const { object, source } = req.body;
    if (!object) return res.status(400).json({ error: 'Object name required' });
    if (!source) return res.status(400).json({ error: 'Source required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const results = [];
    const errors = [];
    
    // Parse CSV
    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Get table schema to validate columns
    const tableData = await dataProvider.getTableData(source, object, req.user.id);
    const validColumns = tableData.headings.map(h => h.name);
    const csvColumns = Object.keys(results[0]);

    // Check if CSV columns match table columns
    const invalidColumns = csvColumns.filter(col => !validColumns.includes(col));
    if (invalidColumns.length > 0) {
      return res.status(400).json({ 
        error: `Invalid columns in CSV: ${invalidColumns.join(', ')}`,
        validColumns: validColumns
      });
    }

    // Import each row
    let successCount = 0;
    for (let i = 0; i < results.length; i++) {
      try {
        await dataProvider.insertRow(source, object, results[i], req.user.id);
        successCount++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({ 
      success: true, 
      imported: successCount,
      total: results.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('CSV import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/refresh-sitemap', requireAuth, async (req, res) => {
  try {
    // Clear caches for all providers
    dataProvider.getAllProviders().forEach(provider => {
      if (provider.metadataCache) provider.metadataCache = null;
      if (provider.schemaCache) provider.schemaCache = {};
      if (provider.foreignKeyCache) provider.foreignKeyCache = {};
    });
    
    const sitemap = await generateDynamicSitemap();
    const totalTables = sitemap.pages.reduce((sum, page) => {
      return sum + (Array.isArray(page.children) ? page.children.length : 0);
    }, 0);
    
    res.json({ success: true, message: 'Sitemap refreshed', tableCount: totalTables });
  } catch (error) {
    console.error('Error refreshing sitemap:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sitemap-html', requireAuth, async (req, res) => {
  try {
    // Clear caches for all providers
    dataProvider.getAllProviders().forEach(provider => {
      if (provider.metadataCache) provider.metadataCache = null;
      if (provider.schemaCache) provider.schemaCache = {};
      if (provider.foreignKeyCache) provider.foreignKeyCache = {};
    });
    
    const sitemap = await loadSitemap();
    const items = Array.isArray(sitemap?.pages) ? sitemap.pages : Array.isArray(sitemap) ? sitemap : [];
    
    function buildNodes(it) {
      if (!Array.isArray(it) || it.length === 0) return '';
      let s = '<ul class="sitemap-list">';
      for (const item of it) {
        const title = escapeHtml(item.title || item.name || 'Unnamed');
        const url = item.url ? escapeHtml(item.url) : null;
        const object = item.object ? escapeHtml(item.object) : (item.url?.includes('?object=') ? escapeHtml(new URL(item.url, 'http://example').searchParams.get('object')) : null);
        const sourceId = item.sourceId ? escapeHtml(item.sourceId) : '';
        const hasChildren = Array.isArray(item.children) && item.children.length > 0;
        s += '<li class="sitemap-item">';
        s += `<span class="sitemap-label"${object ? ` data-object="${object}"` : ''}${sourceId ? ` data-source="${sourceId}"` : ''}${url && !object ? ` data-url="${url}"` : ''} role="button" tabindex="0">${title}</span>`;
        if (hasChildren) {
          s += ` <button class="sitemap-toggle" aria-expanded="false">▶</button>`;
          s += `<div class="sitemap-children d-none">` + buildNodes(item.children) + `</div>`;
        }
        s += '</li>';
      }
      s += '</ul>';
      return s;
    }
    
    const refreshBtn = '<button class="refresh-sitemap-btn" onclick="window.refreshSitemap()" title="Refresh sitemap">↻</button>';
    const sidebarHtml = refreshBtn + buildNodes(items);
    res.json({ success: true, html: sidebarHtml });
  } catch (error) {
    console.error('Error generating sitemap HTML:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  try {
    const result = await dataProvider.login(email, password);
    if (result.success) {
      const sessionId = generateSessionId();
      sessions.set(sessionId, result.user);
      res.json({ ok: true, sessionId, email: result.user.email });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: err.message || 'Invalid credentials' });
  }
});

app.get('/register', (req, res) => {
  res.send(buildRegisterPage());
});

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  
  try {
    const result = await dataProvider.register(email, password);
    if (result.success) {
      res.json({ ok: true, message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.get('/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) sessions.delete(sessionId);
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`dotConfig Data App listening on http://localhost:${PORT}`);
  console.log(`Connected data sources:`);
  config.getEnabledSources().forEach(source => {
    console.log(`  - ${source.name} (${source.type})`);
  });
});