/* StayNest - web server: serves the site and the account API.
   Start with `npm start`, then open http://localhost:3000 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const rules = require('./js/password-rules.js');
const { openDb } = require('./db.js');

const ROOT = __dirname;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const SESSION_SHORT = DAY;        // "Remember me" off: browser-session cookie, server forgets it after a day
const SESSION_LONG = 30 * DAY;    // "Remember me" on
const RESET_TTL = 30 * MINUTE;
const LOCK_MS = 15 * MINUTE;
const LOGIN_LIMIT = 5;            // failed logins per IP + account before a 15-minute lock
const LOGIN_IP_LIMIT = 20;        // failed logins per IP across all accounts
const GENERIC_LOGIN_ERROR = 'Incorrect username or password.';

// pages anyone can open as /name.html; account.html and user.html are only served through their routes
const PUBLIC_PAGES = new Set(['index', 'stays', 'stay-detail', 'experiences', 'destinations', 'host',
  'about', 'help', 'login', 'signup', 'forgot', 'reset']);

// stays that can be booked online, with the prices the server trusts (never the browser's numbers)
const STAYS = {
  'glass-cabin-hunza': { name: 'Glass Cabin with Rakaposhi View', price: 14500, cleaning: 2000, fee: 0.08, maxGuests: 4 }
};

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const str = (value) => (typeof value === 'string' ? value : '');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    if (key in out) continue;
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bad cookie: ignore it */ }
  }
  return out;
}

function sameToken(a, b) {
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// shortcut: counters live in memory, so they reset on restart and aren't shared between processes;
// move them to the database or Redis before running more than one server
function createLimiter() {
  const hits = new Map(); // key -> { count, until }
  return {
    blocked(key, limit) {
      const h = hits.get(key);
      return Boolean(h) && h.until > Date.now() && h.count >= limit;
    },
    hit(key, limit, windowMs) {
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.until <= now) h = { count: 0, until: now + windowMs };
      h.count += 1;
      if (h.count >= limit) h.until = now + windowMs; // the lock runs a full window from the last failure
      hits.set(key, h);
    },
    clear(key) { hits.delete(key); },
    sweep() {
      const now = Date.now();
      for (const [key, h] of hits) if (h.until <= now) hits.delete(key);
    }
  };
}

// CSP hashes for the small inline theme script in each page's <head>
function inlineScriptHashes() {
  const hashes = new Set();
  for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
    for (const m of fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
    }
  }
  return [...hashes];
}

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
const dayOffset = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);

function deviceName(ua) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'an unknown device';
  return `${browser} on ${os}`;
}

function createApp(options = {}) {
  const env = process.env;
  const isProd = options.production ?? env.NODE_ENV === 'production';
  // Railway sets RAILWAY_PUBLIC_DOMAIN and RAILWAY_VOLUME_MOUNT_PATH itself once a domain and a volume are added
  const appUrl = String(options.appUrl || env.APP_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    (isProd ? '' : `http://localhost:${env.PORT || 3000}`)).replace(/\/+$/, '');
  if (!appUrl) throw new Error('Set APP_URL to the site\'s public https address before running in production.');
  const rounds = Number(options.bcryptRounds || env.BCRYPT_ROUNDS) || 12;
  const dbFile = options.dbPath || env.DB_PATH || path.join(env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data'), 'staynest.db');
  if (isProd && !options.dbPath && !env.DB_PATH && !env.RAILWAY_VOLUME_MOUNT_PATH) {
    console.warn('[warning] No volume or DB_PATH: accounts are saved on a temporary disk and will be lost on restart.');
  }
  const db = openDb(dbFile);
  const mailLog = 'mailLog' in options ? options.mailLog : path.join(path.dirname(dbFile), 'mail.log');
  const SID = isProd ? '__Host-sn_sid' : 'sn_sid';
  const CSRF = isProd ? '__Host-sn_csrf' : 'sn_csrf';
  const limiter = createLimiter();
  const outbox = [];
  // compared against when the account doesn't exist, so a wrong username takes as long as a wrong password
  const dummyHash = bcrypt.hashSync(newToken(), rounds);

  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) {
    db.exec('BEGIN');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (err) { db.exec('ROLLBACK'); throw err; }
  }

  function cleanUp() {
    run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    run('DELETE FROM password_resets WHERE expires_at < ?', Date.now() - DAY);
    limiter.sweep();
  }
  cleanUp();
  setInterval(cleanUp, 60 * MINUTE).unref();

  // shortcut: no email service yet, so mail goes to mail.log (next to the database) and the server log,
  // which only the site owner can read; connect a real email service before real users rely on resets
  function sendMail(to, subject, text) {
    outbox.push({ to, subject, text });
    if (!mailLog) return;
    const entry = `--- ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`;
    fs.mkdirSync(path.dirname(mailLog), { recursive: true });
    fs.appendFileSync(mailLog, entry + '\n');
    console.log('[dev mail]\n' + entry);
  }

  const cookieOpts = (maxAge) => ({ httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', ...(maxAge ? { maxAge } : {}) });

  function startSession(req, res, userId, remember) {
    if (req.session) run('DELETE FROM sessions WHERE id = ?', req.session.id); // a fresh session ID on every login
    const token = newToken();
    const now = Date.now();
    const ttl = remember ? SESSION_LONG : SESSION_SHORT;
    run('INSERT INTO sessions (token_hash, user_id, user_agent, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      sha256(token), userId, str(req.get('user-agent')).slice(0, 300), now, now, now + ttl);
    res.cookie(SID, token, cookieOpts(remember ? ttl : 0));
    res.cookie(CSRF, newToken(), cookieOpts());
  }

  function endBrowserSession(res) {
    res.clearCookie(SID, cookieOpts());
    res.cookie(CSRF, newToken(), cookieOpts());
  }

  function sendPage(res, file, status = 200, vars = {}) {
    let html = fs.readFileSync(path.join(ROOT, file), 'utf8')
      // root-based links, so pages also work from nested URLs such as /user/name
      .replace(/(\s(?:href|src|action))="(?![a-z][a-z0-9+.-]*:|[/#?])/gi, '$1="/');
    for (const [key, value] of Object.entries(vars)) html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
    res.status(status).type('html').set('Cache-Control', 'no-store').send(html);
  }

  // Looks up a row by its id and checks that it belongs to the logged-in user
  function findOwned(table, id, userId) {
    if (!/^\d{1,15}$/.test(String(id))) return { status: 404 };
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, Number(id)); // table is always a constant from this file
    if (!row) return { status: 404 };
    if (row.user_id !== userId) return { status: 403 };
    return { row };
  }

  async function passwordMatches(userId, password) {
    const row = get('SELECT password_hash FROM users WHERE id = ?', userId);
    return Boolean(row) && bcrypt.compare(password, row.password_hash);
  }

  function rateLimit(name, limit, windowMs) {
    return (req, res, next) => {
      const key = `${name}:${req.ip}`;
      if (limiter.blocked(key, limit)) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
      limiter.hit(key, limit, windowMs);
      next();
    };
  }

  function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    next();
  }

  function validateBooking(body, stay) {
    const errors = {};
    const checkin = str(body.checkin);
    const checkout = str(body.checkout);
    const guests = Number(body.guests);
    if (!isoDate(checkin)) errors.checkin = 'Pick a check-in date.';
    else if (checkin < dayOffset(-1)) errors.checkin = "Check-in can't be in the past."; // -1: visitors can be a day ahead of UTC
    else if (checkin > dayOffset(730)) errors.checkin = 'Bookings open up to two years ahead.';
    if (!isoDate(checkout)) errors.checkout = 'Pick a check-out date.';
    const nights = errors.checkin || errors.checkout ? 0 : nightsBetween(checkin, checkout);
    if (!errors.checkin && !errors.checkout && nights < 1) errors.checkout = 'Check-out needs to be after check-in.';
    if (nights > 30) errors.checkout = 'Stays can be up to 30 nights.';
    if (!Number.isInteger(guests) || guests < 1 || guests > stay.maxGuests) errors.guests = `Choose 1 to ${stay.maxGuests} guests.`;
    const stayCost = stay.price * nights;
    const total = stayCost + stay.cleaning + Math.round(stayCost * stay.fee);
    return { errors, booking: { checkin, checkout, guests, total } };
  }

  const app = express();

  if (isProd) {
    // Railway's edge replaces any X-Forwarded-* headers a visitor sends, so the first entry is the real visitor
    // (needed for the per-IP login limit). shortcut: Railway-specific; on another host, trust only its proxy hops
    app.set('trust proxy', true);
    app.use((req, res, next) => (req.secure ? next() : res.redirect(308, appUrl + req.originalUrl)));
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'", ...inlineScriptHashes()],
        'img-src': ["'self'", 'data:', 'https://images.unsplash.com'],
        'frame-src': ['https://www.openstreetmap.org'],
        'upgrade-insecure-requests': isProd ? [] : null
      }
    }
  }));

  for (const dir of ['css', 'js', 'img']) {
    app.use('/' + dir, express.static(path.join(ROOT, dir), { index: false, fallthrough: true }));
  }

  // Who is this? Look the session up from the cookie (never from anything in the URL)
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    const token = req.cookies[SID];
    if (token) {
      const row = get(`SELECT s.id AS sid, s.expires_at, s.last_seen, u.id AS uid, u.username, u.email, u.created_at
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, sha256(token));
      if (row && row.expires_at > Date.now()) {
        req.session = { id: row.sid };
        req.user = { id: row.uid, username: row.username, email: row.email, createdAt: row.created_at };
        if (Date.now() - row.last_seen > MINUTE) run('UPDATE sessions SET last_seen = ? WHERE id = ?', Date.now(), row.sid);
      } else {
        if (row) run('DELETE FROM sessions WHERE id = ?', row.sid);
        res.clearCookie(SID, cookieOpts());
      }
    }
    next();
  });

  // CSRF: every change must echo the token from /api/session in an X-CSRF-Token header
  app.use((req, res, next) => {
    let token = req.cookies[CSRF];
    if (!token || token.length < 32) {
      token = newToken();
      res.cookie(CSRF, token, cookieOpts());
    }
    req.csrfToken = token;
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (sameToken(str(req.get('x-csrf-token')), token)) return next();
    if (!req.path.startsWith('/api/')) return sendPage(res, '403.html', 403);
    res.status(403).json({ error: 'Your page was open too long. Refresh it and try again.' });
  });

  app.use(express.json({ limit: '10kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  /* ---------- Session + sign up / log in / log out ---------- */
  app.get('/api/session', (req, res) => {
    const wishlist = req.user ? all('SELECT stay_id FROM wishlist WHERE user_id = ?', req.user.id).map((r) => r.stay_id) : [];
    res.json({ user: req.user ? { username: req.user.username } : null, wishlist, csrfToken: req.csrfToken });
  });

  app.post('/api/signup', rateLimit('signup', 30, 60 * MINUTE), async (req, res) => {
    const body = req.body ?? {};
    const username = str(body.username).trim();
    const email = str(body.email).trim().toLowerCase();
    const password = str(body.password);
    const errors = {};
    const usernameError = rules.usernameProblem(username);
    const emailError = rules.emailProblem(email);
    const passwordError = rules.passwordProblem(password, { username, email });
    if (usernameError) errors.username = usernameError;
    else if (get('SELECT 1 FROM users WHERE username = ?', username)) errors.username = 'That username is taken. Try another one.';
    if (emailError) errors.email = emailError;
    else if (get('SELECT 1 FROM users WHERE email = ?', email)) errors.email = 'An account with this email already exists. Try logging in.';
    if (passwordError) errors.password = passwordError;
    if (str(body.confirm) !== password) errors.confirm = "The passwords don't match.";
    if (body.terms !== true) errors.terms = 'Please accept the terms to continue.';
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const hash = await bcrypt.hash(password, rounds);
    let userId;
    try {
      userId = Number(run('INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
        username, email, hash, Date.now()).lastInsertRowid);
    } catch (err) {
      if (!/UNIQUE/.test(err.message)) throw err;
      return res.status(400).json({ errors: { username: 'That username or email was just taken. Try another one.' } });
    }
    startSession(req, res, userId, false);
    res.status(201).json({ username });
  });

  app.post('/api/login', async (req, res) => {
    const body = req.body ?? {};
    const identifier = str(body.identifier).trim().toLowerCase();
    const password = str(body.password);
    if (!identifier || !password) return res.status(400).json({ error: 'Enter your username or email and your password.' });

    const accountKey = `login:${req.ip}|${identifier}`;
    const ipKey = `login-ip:${req.ip}`;
    if (limiter.blocked(accountKey, LOGIN_LIMIT) || limiter.blocked(ipKey, LOGIN_IP_LIMIT)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again, or reset your password.' });
    }
    const user = get('SELECT id, username, password_hash FROM users WHERE username = ? OR email = ?', identifier, identifier);
    const ok = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
    if (!user || !ok) {
      limiter.hit(accountKey, LOGIN_LIMIT, LOCK_MS);
      limiter.hit(ipKey, LOGIN_IP_LIMIT, LOCK_MS);
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }
    limiter.clear(accountKey);
    startSession(req, res, user.id, body.remember === true);
    res.json({ username: user.username });
  });

  app.post('/api/logout', (req, res) => {
    if (req.session) run('DELETE FROM sessions WHERE id = ?', req.session.id);
    endBrowserSession(res);
    res.json({ ok: true });
  });

  /* ---------- Forgot / reset password ---------- */
  app.post('/api/password/forgot', rateLimit('forgot', 5, LOCK_MS), (req, res) => {
    const email = str((req.body ?? {}).email).trim().toLowerCase();
    const emailError = rules.emailProblem(email);
    if (emailError) return res.status(400).json({ errors: { email: emailError } });
    const user = get('SELECT id, username FROM users WHERE email = ?', email);
    if (user) {
      const token = newToken();
      transaction(() => {
        run('DELETE FROM password_resets WHERE user_id = ?', user.id); // only the newest link works
        run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, Date.now() + RESET_TTL);
      });
      // the link uses the configured APP_URL, never the request's Host header (which an attacker controls)
      sendMail(email, 'Reset your StayNest password',
        `Hi ${user.username},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n` +
        `${appUrl}/reset.html?token=${token}\n\nIf you didn't ask for this, ignore this email; your password stays the same.`);
    }
    res.json({ ok: true }); // same answer either way, so this can't reveal who has an account
  });

  app.post('/api/password/reset', rateLimit('reset', 10, LOCK_MS), async (req, res) => {
    const body = req.body ?? {};
    const token = str(body.token);
    const password = str(body.password);
    const reset = token && get(`SELECT r.id, r.user_id, u.username, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?`, sha256(token), Date.now());
    if (!reset) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    const errors = {};
    const passwordError = rules.passwordProblem(password, { username: reset.username, email: reset.email });
    if (passwordError) errors.password = passwordError;
    if (str(body.confirm) !== password) errors.confirm = "The passwords don't match.";
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    const hash = await bcrypt.hash(password, rounds);
    transaction(() => {
      run('UPDATE users SET password_hash = ? WHERE id = ?', hash, reset.user_id);
      run('UPDATE password_resets SET used_at = ? WHERE id = ?', Date.now(), reset.id);
      run('DELETE FROM sessions WHERE user_id = ?', reset.user_id); // sign out everywhere
    });
    res.json({ ok: true });
  });

  /* ---------- The logged-in user's own account (always from the session) ---------- */
  app.get('/api/account', requireUser, (req, res) => {
    const me = req.user;
    res.json({
      username: me.username,
      email: me.email,
      joined: me.createdAt,
      bookings: all('SELECT id, stay_id, checkin, checkout, guests, total FROM bookings WHERE user_id = ? ORDER BY checkin', me.id)
        .map((b) => ({ id: b.id, stay: b.stay_id, stayName: STAYS[b.stay_id] ? STAYS[b.stay_id].name : b.stay_id,
          maxGuests: STAYS[b.stay_id] ? STAYS[b.stay_id].maxGuests : 1,
          checkin: b.checkin, checkout: b.checkout, guests: b.guests, total: b.total })),
      wishlistCount: get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', me.id).n,
      devices: all('SELECT id, user_agent, created_at, last_seen FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC', me.id, Date.now())
        .map((s) => ({ id: s.id, device: deviceName(s.user_agent), signedIn: s.created_at, lastSeen: s.last_seen, current: s.id === req.session.id }))
    });
  });

  app.post('/api/account/password', requireUser, async (req, res) => {
    const body = req.body ?? {};
    const current = str(body.current);
    const password = str(body.password);
    const key = `password:${req.user.id}`;
    if (limiter.blocked(key, 5)) return res.status(429).json({ error: 'Too many wrong passwords. Please wait 15 minutes.' });
    const errors = {};
    if (!(await passwordMatches(req.user.id, current))) {
      limiter.hit(key, 5, LOCK_MS);
      errors.current = 'Your current password is incorrect.';
    }
    const passwordError = rules.passwordProblem(password, { username: req.user.username, email: req.user.email });
    if (passwordError) errors.password = passwordError;
    else if (password === current) errors.password = 'Choose a password that is different from your current one.';
    if (str(body.confirm) !== password) errors.confirm = "The passwords don't match.";
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    limiter.clear(key);
    const hash = await bcrypt.hash(password, rounds);
    transaction(() => {
      run('UPDATE users SET password_hash = ? WHERE id = ?', hash, req.user.id);
      run('DELETE FROM sessions WHERE user_id = ? AND id != ?', req.user.id, req.session.id); // other devices must log in again
    });
    res.json({ ok: true });
  });

  app.post('/api/account/delete', requireUser, async (req, res) => {
    const key = `password:${req.user.id}`;
    if (limiter.blocked(key, 5)) return res.status(429).json({ error: 'Too many wrong passwords. Please wait 15 minutes.' });
    if (!(await passwordMatches(req.user.id, str((req.body ?? {}).password)))) {
      limiter.hit(key, 5, LOCK_MS);
      return res.status(400).json({ errors: { password: 'Your password is incorrect.' } });
    }
    run('DELETE FROM users WHERE id = ?', req.user.id); // sessions, bookings, wishlist and resets go with it
    endBrowserSession(res);
    res.json({ ok: true });
  });

  app.delete('/api/sessions/:id', requireUser, (req, res) => {
    const found = findOwned('sessions', req.params.id, req.user.id);
    if (!found.row) return res.status(found.status).json({ error: found.status === 403 ? 'That is not your device.' : 'Device not found.' });
    run('DELETE FROM sessions WHERE id = ?', found.row.id);
    const signedOut = found.row.id === req.session.id;
    if (signedOut) endBrowserSession(res);
    res.json({ ok: true, signedOut });
  });

  app.post('/api/sessions/revoke-all', requireUser, (req, res) => {
    run('DELETE FROM sessions WHERE user_id = ?', req.user.id);
    endBrowserSession(res);
    res.json({ ok: true });
  });

  /* ---------- Bookings (create, read via /api/account, update, delete) ---------- */
  app.post('/api/bookings', requireUser, (req, res) => {
    const body = req.body ?? {};
    const stayId = str(body.stay);
    const stay = Object.hasOwn(STAYS, stayId) ? STAYS[stayId] : null;
    if (!stay) return res.status(400).json({ error: "This stay can't be booked online yet." });
    const { errors, booking } = validateBooking(body, stay);
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    const id = Number(run('INSERT INTO bookings (user_id, stay_id, checkin, checkout, guests, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      req.user.id, stayId, booking.checkin, booking.checkout, booking.guests, booking.total, Date.now()).lastInsertRowid);
    res.status(201).json({ id, stay: stayId, ...booking });
  });

  app.patch('/api/bookings/:id', requireUser, (req, res) => {
    const found = findOwned('bookings', req.params.id, req.user.id);
    if (!found.row) return res.status(found.status).json({ error: found.status === 403 ? 'That is not your booking.' : 'Booking not found.' });
    const stay = STAYS[found.row.stay_id];
    if (!stay) return res.status(400).json({ error: "This stay can't be changed online." });
    const { errors, booking } = validateBooking({ guests: found.row.guests, ...(req.body ?? {}) }, stay);
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    run('UPDATE bookings SET checkin = ?, checkout = ?, guests = ?, total = ? WHERE id = ?',
      booking.checkin, booking.checkout, booking.guests, booking.total, found.row.id);
    res.json({ id: found.row.id, stay: found.row.stay_id, ...booking });
  });

  app.delete('/api/bookings/:id', requireUser, (req, res) => {
    const found = findOwned('bookings', req.params.id, req.user.id);
    if (!found.row) return res.status(found.status).json({ error: found.status === 403 ? 'That is not your booking.' : 'Booking not found.' });
    run('DELETE FROM bookings WHERE id = ?', found.row.id);
    res.json({ ok: true });
  });

  app.put('/api/wishlist', requireUser, (req, res) => {
    const ids = (req.body ?? {}).ids;
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id))) {
      return res.status(400).json({ error: 'That wishlist could not be saved.' });
    }
    const unique = [...new Set(ids)];
    transaction(() => {
      run('DELETE FROM wishlist WHERE user_id = ?', req.user.id);
      for (const id of unique) run('INSERT INTO wishlist (user_id, stay_id) VALUES (?, ?)', req.user.id, id);
    });
    res.json({ ids: unique });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  /* ---------- Pages ---------- */
  app.get('/', (req, res) => sendPage(res, 'index.html'));

  app.get('/account', (req, res) => {
    if (!req.user) return res.redirect('/login.html?next=/account');
    sendPage(res, 'account.html');
  });

  // Public profile: only the username, avatar letter and join month ever reach this page
  app.get('/user/:username', (req, res) => {
    const name = req.params.username;
    const user = !rules.usernameProblem(name) && get('SELECT username, created_at FROM users WHERE username = ?', name);
    if (!user) return sendPage(res, '404.html', 404);
    let hue = 0;
    for (const ch of user.username.toLowerCase()) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    sendPage(res, 'user.html', 200, {
      username: user.username,
      initial: user.username[0].toUpperCase(),
      hue,
      joined: new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    });
  });

  app.get(/^\/([a-z-]+)\.html$/, (req, res, next) => {
    const page = req.params[0];
    if (!PUBLIC_PAGES.has(page)) return next();
    if (req.user && (page === 'login' || page === 'signup')) return res.redirect('/account');
    sendPage(res, page + '.html');
  });

  app.use((req, res) => sendPage(res, '404.html', 404));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'That request could not be read.' });
    }
    console.error(err.stack || err); // never log req.body: it can hold passwords
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
    sendPage(res, '500.html', 500);
  });

  app.locals.db = db;
  app.locals.outbox = outbox;
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`StayNest is running on port ${port} (http://localhost:${port} on this computer)`));
}

module.exports = { createApp };
