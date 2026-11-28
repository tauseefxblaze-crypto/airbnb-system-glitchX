/* Run with `npm test`. Each run uses a fresh in-memory database and a random port. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../js/password-rules.js');
const { createApp } = require('../server.js');

let server;
let base;
let app;

before(async () => {
  app = createApp({ dbPath: ':memory:', mailLog: null, bcryptRounds: 4, appUrl: 'http://staynest.test' });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

// A tiny browser: keeps cookies and sends the CSRF token the way js/main.js does
function browser(userAgent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0') {
  const jar = {};
  async function send(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        'user-agent': userAgent,
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value || /expires=Thu, 01 Jan 1970/i.test(line)) delete jar[name]; else jar[name] = value;
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  return {
    jar,
    get: (path) => send('GET', path),
    async call(method, path, body) {
      const session = await send('GET', '/api/session');
      return send(method, path, body, { 'x-csrf-token': session.data.csrfToken });
    }
  };
}

let counter = 0;
function newUser() {
  counter += 1;
  return { username: `traveller_${counter}`, email: `traveller${counter}@example.com`, password: 'Hunza-Valley-2026!' };
}
async function signUp(b, user) {
  return b.call('POST', '/api/signup', { ...user, confirm: user.password, terms: true });
}

test('password rules: strength levels and blocked passwords', () => {
  assert.equal(rules.strength('short1!').level, 'bad');
  assert.equal(rules.strength('password').level, 'bad');
  assert.equal(rules.strength('Password123!').level, 'bad', 'a common password with decorations is still common');
  assert.equal(rules.strength('P@ssw0rd').level, 'bad');
  assert.equal(rules.strength('abcdefghij').level, 'bad', 'one kind of character and short');
  assert.equal(rules.strength('mountain42x').level, 'good');
  assert.equal(rules.strength('Hunza-Valley-2026!').level, 'strong');
  assert.equal(rules.strength('glitchx_99abc', { username: 'glitchx_99' }).level, 'bad', 'contains the username');
  assert.equal(rules.usernameProblem('ok_name1'), '');
  assert.notEqual(rules.usernameProblem('no spaces'), '');
  assert.notEqual(rules.usernameProblem('ab'), '');
  assert.notEqual(rules.usernameProblem('a'.repeat(21)), '');
});

test('signup: the server re-checks every field (never trusts the browser)', async () => {
  const b = browser();
  const res = await b.call('POST', '/api/signup', {
    username: 'bad name!', email: 'not-an-email', password: 'password', confirm: 'different', terms: false
  });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(res.data.errors).sort(), ['confirm', 'email', 'password', 'terms', 'username']);

  const weak = await b.call('POST', '/api/signup', { username: 'weakling', email: 'weak@example.com', password: 'abcdefgh', confirm: 'abcdefgh', terms: true });
  assert.equal(weak.status, 400);
  assert.ok(weak.data.errors.password, 'a "Bad" password is blocked');

  const wrongTypes = await b.call('POST', '/api/signup', { username: ['x'], email: { a: 1 }, password: 12345678, terms: 'yes' });
  assert.equal(wrongTypes.status, 400);
});

test('signup: usernames and emails are unique, ignoring case', async () => {
  const user = newUser();
  const first = await signUp(browser(), user);
  assert.equal(first.status, 201);
  assert.equal(first.data.username, user.username);

  const sameName = await signUp(browser(), { ...user, username: user.username.toUpperCase(), email: 'other@example.com' });
  assert.equal(sameName.status, 400);
  assert.match(sameName.data.errors.username, /taken/);

  const sameEmail = await signUp(browser(), { ...user, username: 'someone_else', email: user.email.toUpperCase() });
  assert.equal(sameEmail.status, 400);
  assert.match(sameEmail.data.errors.email, /already exists/);
});

test('passwords are stored as bcrypt hashes, never as plain text', async () => {
  const user = newUser();
  await signUp(browser(), user);
  const row = app.locals.db.prepare('SELECT password_hash FROM users WHERE username = ?').get(user.username);
  assert.match(row.password_hash, /^\$2[aby]\$/);
  assert.ok(!row.password_hash.includes(user.password));
});

test('login: works with username or email on a second device; wrong details get one generic message', async () => {
  const user = newUser();
  await signUp(browser(), user);

  const device2 = browser('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile');
  const byEmail = await device2.call('POST', '/api/login', { identifier: user.email.toUpperCase(), password: user.password });
  assert.equal(byEmail.status, 200);
  assert.equal((await device2.get('/api/session')).data.user.username, user.username);

  const byName = await browser().call('POST', '/api/login', { identifier: user.username, password: user.password });
  assert.equal(byName.status, 200);

  const wrongPassword = await browser().call('POST', '/api/login', { identifier: user.username, password: 'Not-The-Password-1' });
  const unknownUser = await browser().call('POST', '/api/login', { identifier: 'nobody_here', password: user.password });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.equal(wrongPassword.data.error, 'Incorrect username or password.');
  assert.deepEqual(wrongPassword.data, unknownUser.data, 'the reply never says which part was wrong');
});

test('login: a new session ID is issued on every login', async () => {
  const user = newUser();
  const b = browser();
  await signUp(b, user);
  const firstSid = b.jar.sn_sid;
  await b.call('POST', '/api/login', { identifier: user.username, password: user.password });
  assert.ok(b.jar.sn_sid && b.jar.sn_sid !== firstSid);
  const old = await fetch(base + '/api/account', { headers: { cookie: `sn_sid=${firstSid}` } });
  assert.equal(old.status, 401, 'the old session no longer works');
});

test('login: locked for 15 minutes after 5 failed tries, even with the right password', async () => {
  const user = newUser();
  await signUp(browser(), user);
  const attacker = browser();
  for (let i = 0; i < 5; i++) {
    const res = await attacker.call('POST', '/api/login', { identifier: user.username, password: `Wrong-guess-${i}x` });
    assert.equal(res.status, 401);
  }
  const locked = await attacker.call('POST', '/api/login', { identifier: user.username, password: user.password });
  assert.equal(locked.status, 429);
  assert.match(locked.data.error, /Too many failed attempts/);
});

test('cookies are httpOnly and SameSite', async () => {
  const user = newUser();
  const res = await fetch(base + '/api/session');
  const csrfCookie = res.headers.getSetCookie().join('\n');
  assert.match(csrfCookie, /HttpOnly/);
  assert.match(csrfCookie, /SameSite=Lax/);
  const b = browser();
  const session = await b.get('/api/session');
  const signup = await fetch(base + '/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': session.data.csrfToken, cookie: `sn_csrf=${b.jar.sn_csrf}` },
    body: JSON.stringify({ ...user, confirm: user.password, terms: true })
  });
  const sid = signup.headers.getSetCookie().find((c) => c.startsWith('sn_sid='));
  assert.match(sid, /HttpOnly/);
  assert.match(sid, /SameSite=Lax/);
});

test('CSRF: changes without the token are refused', async () => {
  const user = newUser();
  const b = browser();
  await signUp(b, user);
  const cookie = Object.entries(b.jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const noToken = await fetch(base + '/api/logout', { method: 'POST', headers: { cookie } });
  assert.equal(noToken.status, 403);
  const wrongToken = await fetch(base + '/api/account/delete', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': 'x'.repeat(43) },
    body: JSON.stringify({ password: user.password })
  });
  assert.equal(wrongToken.status, 403);
  assert.equal((await b.get('/api/account')).status, 200, 'still logged in, account not deleted');
});

test('private pages need a login: /account redirects, the API says 401', async () => {
  const anon = browser();
  const page = await anon.get('/account');
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login.html?next=/account');
  assert.equal((await anon.get('/api/account')).status, 401);
  assert.equal((await anon.call('POST', '/api/bookings', { stay: 'glass-cabin-hunza' })).status, 401);
});

test('user A cannot open or change user B\'s private data', async () => {
  const a = browser();
  const b = browser();
  const userA = newUser();
  const userB = newUser();
  await signUp(a, userA);
  await signUp(b, userB);

  const checkin = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const checkout = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
  const booking = await a.call('POST', '/api/bookings', { stay: 'glass-cabin-hunza', checkin, checkout, guests: 2, total: 1 });
  assert.equal(booking.status, 201);
  assert.equal(booking.data.total, 14500 * 3 + 2000 + Math.round(14500 * 3 * 0.08), 'the server sets the price, not the browser');

  // B's account page only ever shows B, whatever B asks for
  const bAccount = await b.get('/api/account?user=' + encodeURIComponent(userA.username) + '&id=1');
  assert.equal(bAccount.data.username, userB.username);
  assert.equal(bAccount.data.bookings.length, 0);
  assert.ok(!JSON.stringify(bAccount.data).includes(userA.email));

  // B can't change or cancel A's booking
  const edit = await b.call('PATCH', `/api/bookings/${booking.data.id}`, { checkin, checkout, guests: 1 });
  const cancel = await b.call('DELETE', `/api/bookings/${booking.data.id}`);
  assert.equal(edit.status, 403);
  assert.equal(cancel.status, 403);

  // B can't sign out A's devices
  const aDevice = (await a.get('/api/account')).data.devices[0];
  assert.equal((await b.call('DELETE', `/api/sessions/${aDevice.id}`)).status, 403);

  // A's data is untouched and A is still logged in
  const aAccount = await a.get('/api/account');
  assert.equal(aAccount.status, 200);
  assert.equal(aAccount.data.bookings.length, 1);
  assert.equal(aAccount.data.bookings[0].guests, 2);

  // and A can change and cancel their own booking
  assert.equal((await a.call('PATCH', `/api/bookings/${booking.data.id}`, { checkin, checkout, guests: 3 })).data.guests, 3);
  assert.equal((await a.call('DELETE', `/api/bookings/${booking.data.id}`)).status, 200);
});

test('public profile shows only safe info; email and IDs never appear', async () => {
  const user = newUser();
  await signUp(browser(), user);
  const page = await browser().get('/user/' + user.username.toUpperCase());
  assert.equal(page.status, 200);
  assert.ok(page.data.includes(user.username));
  assert.ok(!page.data.includes(user.email));
  assert.ok(!page.data.includes('password_hash'));
  assert.equal((await browser().get('/user/nobody_at_all')).status, 404);
  assert.equal((await browser().get('/user/<script>')).status, 404);
});

test('logout ends the session on the server, not just in the browser', async () => {
  const user = newUser();
  const b = browser();
  await signUp(b, user);
  const sid = b.jar.sn_sid;
  assert.equal((await b.call('POST', '/api/logout')).status, 200);
  assert.equal((await b.get('/api/account')).status, 401);
  const replay = await fetch(base + '/api/account', { headers: { cookie: `sn_sid=${sid}` } });
  assert.equal(replay.status, 401, 'a copied old cookie is useless after logout');
});

test('log out of all devices, and signing out one device', async () => {
  const user = newUser();
  const laptop = browser();
  const phone = browser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1');
  await signUp(laptop, user);
  await phone.call('POST', '/api/login', { identifier: user.username, password: user.password });

  const devices = (await laptop.get('/api/account')).data.devices;
  assert.equal(devices.length, 2);
  const phoneDevice = devices.find((d) => !d.current);
  assert.equal(phoneDevice.device, 'Safari on iOS');
  assert.equal((await laptop.call('DELETE', `/api/sessions/${phoneDevice.id}`)).status, 200);
  assert.equal((await phone.get('/api/account')).status, 401);

  await phone.call('POST', '/api/login', { identifier: user.username, password: user.password });
  assert.equal((await laptop.call('POST', '/api/sessions/revoke-all')).status, 200);
  assert.equal((await laptop.get('/api/account')).status, 401);
  assert.equal((await phone.get('/api/account')).status, 401);
});

test('change password needs the current one and signs out other devices', async () => {
  const user = newUser();
  const laptop = browser();
  const phone = browser();
  await signUp(laptop, user);
  await phone.call('POST', '/api/login', { identifier: user.username, password: user.password });

  const wrong = await laptop.call('POST', '/api/account/password', { current: 'Wrong-Current-1!', password: 'New-Strong-Pass-9!', confirm: 'New-Strong-Pass-9!' });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.data.errors.current);

  const ok = await laptop.call('POST', '/api/account/password', { current: user.password, password: 'New-Strong-Pass-9!', confirm: 'New-Strong-Pass-9!' });
  assert.equal(ok.status, 200);
  assert.equal((await laptop.get('/api/account')).status, 200, 'this device stays logged in');
  assert.equal((await phone.get('/api/account')).status, 401, 'other devices are signed out');
  assert.equal((await browser().call('POST', '/api/login', { identifier: user.username, password: 'New-Strong-Pass-9!' })).status, 200);
});

test('forgot password: one-time link that expires, and the answer never reveals who has an account', async () => {
  const user = newUser();
  const b = browser();
  await signUp(b, user);
  const outbox = app.locals.outbox;

  const unknown = await browser().call('POST', '/api/password/forgot', { email: 'ghost@example.com' });
  const known = await browser().call('POST', '/api/password/forgot', { email: user.email });
  assert.deepEqual(unknown.data, known.data);
  const mail = outbox.at(-1);
  assert.equal(mail.to, user.email);
  const link = mail.text.match(/http:\/\/staynest\.test\/reset\.html\?token=([\w-]+)/);
  assert.ok(link, 'the link uses APP_URL, not the Host header');
  const token = link[1];

  const weak = await browser().call('POST', '/api/password/reset', { token, password: 'abcdefgh', confirm: 'abcdefgh' });
  assert.equal(weak.status, 400);

  const reset = await browser().call('POST', '/api/password/reset', { token, password: 'Fresh-Mountain-77!', confirm: 'Fresh-Mountain-77!' });
  assert.equal(reset.status, 200);
  assert.equal((await b.get('/api/account')).status, 401, 'old sessions are signed out');
  assert.equal((await browser().call('POST', '/api/login', { identifier: user.email, password: 'Fresh-Mountain-77!' })).status, 200);

  const again = await browser().call('POST', '/api/password/reset', { token, password: 'Another-Pass-88!', confirm: 'Another-Pass-88!' });
  assert.equal(again.status, 400, 'the link works only once');

  await browser().call('POST', '/api/password/forgot', { email: user.email });
  const expiring = outbox.at(-1).text.match(/token=([\w-]+)/)[1];
  app.locals.db.prepare('UPDATE password_resets SET expires_at = ?').run(Date.now() - 1);
  const expired = await browser().call('POST', '/api/password/reset', { token: expiring, password: 'Another-Pass-88!', confirm: 'Another-Pass-88!' });
  assert.equal(expired.status, 400, 'expired links are refused');
});

test('delete account needs the password and removes everything', async () => {
  const user = newUser();
  const b = browser();
  await signUp(b, user);
  assert.equal((await b.call('PUT', '/api/wishlist', { ids: ['glass-cabin-hunza', 'naran-chalet'] })).status, 200);
  assert.deepEqual((await b.get('/api/session')).data.wishlist.sort(), ['glass-cabin-hunza', 'naran-chalet']);

  const wrong = await b.call('POST', '/api/account/delete', { password: 'Not-My-Password-1' });
  assert.equal(wrong.status, 400);
  const ok = await b.call('POST', '/api/account/delete', { password: user.password });
  assert.equal(ok.status, 200);
  assert.equal((await b.get('/api/account')).status, 401);
  assert.equal((await browser().get('/user/' + user.username)).status, 404);
  assert.equal((await browser().call('POST', '/api/login', { identifier: user.username, password: user.password })).status, 401);
});

test('pages: security headers, friendly 404, private templates not served', async () => {
  const home = await browser().get('/');
  assert.equal(home.status, 200);
  assert.ok(home.headers.get('content-security-policy').includes("script-src 'self' 'sha256-"));
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('x-powered-by'), null);

  const missing = await browser().get('/no-such-page');
  assert.equal(missing.status, 404);
  assert.ok(missing.data.includes("doesn't go anywhere"));

  for (const path of ['/account.html', '/user.html', '/server.js', '/package.json', '/data/staynest.db', '/test/auth.test.js']) {
    assert.equal((await browser().get(path)).status, 404, path);
  }
});
