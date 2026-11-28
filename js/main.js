/* StayNest - shared script for every page.
   Each feature checks that its elements exist, so one file works on all pages. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // localStorage can throw (private mode, blocked storage) - never let that break the page
  var storage = {
    get: function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
    remove: function (key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  var formatPKR = function (n) { return 'Rs ' + Math.round(n).toLocaleString('en-US'); };

  /* ---------- Toast messages ---------- */
  var toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
  var toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2800);
  }

  /* ---------- Accounts: who is logged in + a helper to call the server ---------- */
  // On GitHub Pages (or any static copy) there is no server: /api/session fails and accounts switch off
  var OFFLINE_MESSAGE = 'Accounts need the StayNest server. This copy of the site is a design preview.';
  var session = { user: null, wishlist: [], csrfToken: '', offline: false };
  var sessionReady = fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('no server'); return res.json(); })
    .then(function (data) {
      session.user = data.user || null;
      session.wishlist = Array.isArray(data.wishlist) ? data.wishlist : [];
      session.csrfToken = data.csrfToken || '';
    })
    .catch(function () { session.offline = true; })
    .then(function () { return session; });

  // Sends JSON plus the CSRF token; resolves to the reply's data with .status and .ok added
  function api(method, url, body) {
    return sessionReady.then(function () {
      if (session.offline) throw new Error(OFFLINE_MESSAGE);
      return fetch(url, {
        method: method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        data.status = res.status;
        data.ok = res.ok;
        return data;
      });
    });
  }

  // Only same-site paths like "/account", never "//evil.com"
  function nextUrl() {
    var next = new URLSearchParams(window.location.search).get('next') || '';
    if (!/^\/(?![/\\])/.test(next)) return '';
    // resolve it like the browser will (it drops tabs/newlines), so "/\t/evil.site" can't leave this site
    var url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '';
  }

  /* ---------- Dark mode (follows the device; the toggle is an override) ---------- */
  var themeBtn = $('[data-theme-toggle]');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function deviceTheme() { return darkQuery.matches ? 'dark' : 'light'; }
  function syncThemeButton() {
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      // picking the device's own theme is no override, so go back to following the device
      if (next === deviceTheme()) storage.remove('sn-theme'); else storage.set('sn-theme', next);
      syncThemeButton();
    });
  }
  // device switched day/night: follow it right away and drop any old manual choice
  darkQuery.addEventListener('change', function () {
    storage.remove('sn-theme');
    root.dataset.theme = deviceTheme();
    syncThemeButton();
  });
  syncThemeButton();

  /* ---------- Mobile menu ---------- */
  var menuBtn = $('[data-menu-toggle]');
  var nav = $('#main-nav');
  function setMenu(open) {
    if (!menuBtn || !nav) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
  }
  var menuIsOpen = function () { return menuBtn && menuBtn.getAttribute('aria-expanded') === 'true'; };
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () { setMenu(!menuIsOpen()); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuIsOpen()) { setMenu(false); menuBtn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (menuIsOpen() && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
    window.matchMedia('(min-width: 1080px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });
  }

  /* ---------- Header shadow + back-to-top ---------- */
  var header = $('.site-header');
  var toTop = $('[data-to-top]');
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (toTop) toTop.classList.toggle('is-visible', y > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      var main = $('#main');
      if (main) main.focus({ preventScroll: true });
    });
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Image skeletons: shimmer until each photo loads ---------- */
  $$('.media > img').forEach(function (img) {
    var box = img.parentElement;
    var done = function () { box.classList.add('is-loaded'); };
    var fail = function () { box.classList.add('is-loaded', 'is-broken'); };
    if (img.complete) {
      if (img.naturalWidth) done(); else fail();
    } else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', fail, { once: true });
    }
  });

  /* ---------- Reveal sections on scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Wishlist hearts (saved in localStorage) ---------- */
  var WISH_KEY = 'sn-wishlist';
  function readWishlist() {
    try {
      var list = JSON.parse(storage.get(WISH_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  var wishlist = readWishlist();
  function syncHearts() {
    $$('[data-wish]').forEach(function (btn) {
      var saved = wishlist.indexOf(btn.dataset.wish) !== -1;
      btn.setAttribute('aria-pressed', String(saved));
      btn.classList.toggle('is-saved', saved);
      var label = btn.querySelector('[data-wish-label]');
      if (label) label.textContent = saved ? 'Saved' : 'Save';
    });
    $$('[data-wish-count]').forEach(function (el) {
      el.textContent = wishlist.length;
      el.hidden = wishlist.length === 0;
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-wish]');
    if (!btn) return;
    e.preventDefault();
    var id = btn.dataset.wish;
    var name = btn.dataset.name || 'this place';
    var index = wishlist.indexOf(id);
    if (index === -1) {
      wishlist.push(id);
      toast('Saved ' + name + ' to your wishlist');
      if (!reduceMotion.matches) {
        btn.classList.remove('pop');
        void btn.offsetWidth; // restart the animation
        btn.classList.add('pop');
      }
    } else {
      wishlist.splice(index, 1);
      toast('Removed ' + name + ' from your wishlist');
    }
    storage.set(WISH_KEY, JSON.stringify(wishlist));
    syncHearts();
    document.dispatchEvent(new CustomEvent('wishlist:change'));
    pushWishlist();
  });
  window.addEventListener('storage', function (e) {
    if (e.key === WISH_KEY) { wishlist = readWishlist(); syncHearts(); document.dispatchEvent(new CustomEvent('wishlist:change')); }
  });
  syncHearts();

  // Logged in: the wishlist lives in the account, so it follows you to any device.
  // On the first page after logging in, stays saved while logged out are added to it once.
  var WISH_OWNER_KEY = 'sn-wishlist-account';
  function pushWishlist() {
    if (session.user) api('PUT', '/api/wishlist', { ids: wishlist }).catch(function () { /* still saved on this device */ });
  }
  function forgetAccountWishlist() {
    wishlist = [];
    storage.remove(WISH_KEY);
    storage.remove(WISH_OWNER_KEY);
  }
  sessionReady.then(function () {
    if (session.offline) return;
    if (!session.user) {
      // signed out from another device: don't leave this account's list behind on a shared computer
      if (storage.get(WISH_OWNER_KEY)) {
        forgetAccountWishlist();
        syncHearts();
        document.dispatchEvent(new CustomEvent('wishlist:change'));
      }
      return;
    }
    var merge = storage.get(WISH_OWNER_KEY) !== '1';
    var list = session.wishlist.slice();
    if (merge) wishlist.forEach(function (id) { if (list.indexOf(id) === -1) list.push(id); });
    var changed = list.length !== session.wishlist.length;
    wishlist = list;
    storage.set(WISH_KEY, JSON.stringify(wishlist));
    storage.set(WISH_OWNER_KEY, '1');
    syncHearts();
    document.dispatchEvent(new CustomEvent('wishlist:change'));
    if (changed) pushWishlist();
  });

  /* ---------- Header: account link + log out when logged in ---------- */
  sessionReady.then(function () {
    if (!session.user) return;
    var name = session.user.username;
    root.classList.add('is-logged-in');
    $$('.header-login').forEach(function (link) {
      link.href = '/account';
      var label = document.createElement('span');
      label.className = 'header-name';
      label.textContent = name;
      link.replaceChild(label, link.lastChild);
      link.title = name;
      link.setAttribute('aria-label', 'Your account (' + name + ')');
      if (window.location.pathname === '/account') link.setAttribute('aria-current', 'page');
      var out = document.createElement('button');
      out.type = 'button';
      out.className = 'icon-btn header-logout';
      out.setAttribute('aria-label', 'Log out');
      out.title = 'Log out';
      out.setAttribute('data-logout', '');
      out.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>';
      link.after(out);
    });
    $$('.nav-login').forEach(function (item) {
      var link = item.querySelector('a');
      if (link) { link.href = '/account'; link.textContent = 'Your account'; }
      var out = document.createElement('button');
      out.type = 'button';
      out.className = 'nav-logout';
      out.setAttribute('data-logout', '');
      out.textContent = 'Log out';
      item.appendChild(out);
    });
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-logout]');
    if (!btn) return;
    btn.disabled = true;
    api('POST', '/api/logout').then(function () {
      forgetAccountWishlist();
      window.location.href = '/';
    }).catch(function () {
      btn.disabled = false;
      toast("Couldn't log out. Check your connection and try again.");
    });
  });

  /* ---------- Date helpers (YYYY-MM-DD strings) ---------- */
  function todayISO() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function nightsBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }
  // Keep check-out after check-in on any pair of date inputs
  function linkDates(cin, cout) {
    var today = todayISO();
    cin.min = today;
    cout.min = addDays(today, 1);
    cin.addEventListener('change', function () {
      if (!cin.value) return;
      cout.min = addDays(cin.value, 1);
      if (cout.value && cout.value <= cin.value) cout.value = addDays(cin.value, 1);
    });
  }

  /* ---------- Search forms (home, 404) ---------- */
  $$('[data-search-form]').forEach(function (form) {
    var cin = form.elements.checkin;
    var cout = form.elements.checkout;
    if (cin && cout) linkDates(cin, cout);
    form.addEventListener('submit', function (e) {
      if (cin && cout && cin.value && cout.value && cout.value <= cin.value) {
        e.preventDefault();
        toast('Check-out needs to be after check-in.');
        cout.focus();
      }
    });
  });

  /* ---------- Filter chips, search box and sort (stays & experiences) ---------- */
  $$('[data-collection]').forEach(function (list) {
    var scope = list.closest('[data-collection-scope]') || document;
    var items = $$('[data-item]', list);
    var chips = $$('[data-filter]', scope);
    var sortSelect = $('[data-sort]', scope);
    var searchInput = $('[data-search]', scope);
    var countEl = $('[data-count]', scope);
    var emptyEl = $('[data-empty]', scope);
    var noun = list.dataset.noun || 'result';
    var params = new URLSearchParams(window.location.search);

    var filter = params.get('saved') ? 'saved' : (params.get('type') || 'all');
    if (!chips.some(function (c) { return c.dataset.filter === filter; })) filter = 'all';
    if (searchInput && params.get('where')) searchInput.value = params.get('where');

    function matches(item, query) {
      var categories = (item.dataset.category || '').split(' ');
      var passesFilter = filter === 'all' ||
        (filter === 'saved' ? wishlist.indexOf(item.dataset.id) !== -1 : categories.indexOf(filter) !== -1);
      var haystack = ((item.dataset.location || '') + ' ' + item.textContent).toLowerCase();
      return passesFilter && (!query || haystack.indexOf(query) !== -1);
    }

    function apply() {
      var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
      var shown = 0;
      items.forEach(function (item) {
        var ok = matches(item, query);
        item.hidden = !ok;
        if (ok) shown++;
      });

      if (sortSelect) {
        var mode = sortSelect.value;
        items.slice().sort(function (a, b) {
          if (mode === 'price-asc') return a.dataset.price - b.dataset.price;
          if (mode === 'price-desc') return b.dataset.price - a.dataset.price;
          if (mode === 'rating') return b.dataset.rating - a.dataset.rating;
          return a.dataset.order - b.dataset.order;
        }).forEach(function (item) { list.appendChild(item); });
      }

      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.filter === filter)); });
      if (countEl) countEl.textContent = shown + ' ' + noun + (shown === 1 ? '' : 's');
      if (emptyEl) emptyEl.hidden = shown > 0;
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () { filter = chip.dataset.filter; apply(); });
    });
    if (sortSelect) sortSelect.addEventListener('change', apply);
    if (searchInput) {
      searchInput.addEventListener('input', apply);
      var form = searchInput.form;
      if (form) form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    }
    $$('[data-reset]', scope).forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = 'all';
        if (searchInput) searchInput.value = '';
        apply();
      });
    });
    document.addEventListener('wishlist:change', function () { if (filter === 'saved') apply(); });
    apply();
  });

  /* ---------- Accordions (help + host FAQ) ---------- */
  $$('.acc-trigger').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.closest('.acc-item').classList.toggle('is-open', open);
    });
  });

  /* ---------- Help centre: live FAQ search ---------- */
  var faqSearch = $('[data-faq-search]');
  if (faqSearch) {
    var faqItems = $$('#faq-list .acc-item');
    var faqGroups = $$('#faq-list [data-faq-group]');
    var faqEmpty = $('[data-faq-empty]');
    var faqStatus = $('[data-faq-status]');
    var runFaqSearch = function () {
      var q = faqSearch.value.trim().toLowerCase();
      var shown = 0;
      faqItems.forEach(function (item) {
        var ok = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
        item.hidden = !ok;
        if (ok) shown++;
      });
      faqGroups.forEach(function (group) {
        group.hidden = !$$('.acc-item', group).some(function (i) { return !i.hidden; });
      });
      faqEmpty.hidden = shown > 0;
      faqStatus.textContent = q ? shown + (shown === 1 ? ' answer' : ' answers') + ' found for "' + faqSearch.value.trim() + '"' : '';
    };
    faqSearch.addEventListener('input', runFaqSearch);
    faqSearch.form.addEventListener('submit', function (e) {
      e.preventDefault();
      runFaqSearch();
      var first = $('#faq-list .acc-item:not([hidden]) .acc-trigger');
      if (first) first.focus();
    });
    $$('[data-faq-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () { faqSearch.value = ''; runFaqSearch(); faqSearch.focus(); });
    });
  }

  /* ---------- Password fields: show/hide button + live strength meter ---------- */
  // The same rules (js/password-rules.js) run again on the server, so the browser check is only for speed
  var Rules = window.SNRules;
  function ruleContext(form) {
    var u = form && form.elements.username;
    var m = form && form.elements.email;
    return { username: u ? u.value.trim() : (session.user ? session.user.username : ''), email: m ? m.value.trim() : '' };
  }
  $$('input[type="password"]').forEach(function (input) {
    var wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'pw-toggle';
    eye.setAttribute('aria-label', 'Show password');
    eye.setAttribute('aria-pressed', 'false');
    eye.setAttribute('aria-controls', input.id);
    eye.innerHTML = '<svg class="i i-eye" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
      '<svg class="i i-eye-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
    eye.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      input.focus();
    });
    wrap.appendChild(eye);
  });

  var LEVEL_TEXT = { bad: 'Bad', good: 'Good', strong: 'Strong' };
  $$('input[data-strength]').forEach(function (input) {
    if (!Rules) return;
    var meter = document.createElement('div');
    meter.className = 'strength';
    meter.innerHTML = '<span class="strength-bar" aria-hidden="true"><span></span></span><span class="strength-label" aria-live="polite"></span>';
    var label = meter.lastChild;
    (input.closest('.pw-wrap') || input).after(meter);
    var update = function () {
      var level = input.value ? Rules.strength(input.value, ruleContext(input.form)).level : '';
      var text = level ? 'Strength: ' + LEVEL_TEXT[level] : '';
      meter.setAttribute('data-level', level);
      if (label.textContent !== text) label.textContent = text;
    };
    input.addEventListener('input', update);
    if (input.form) {
      input.form.addEventListener('input', function (e) { if (e.target.name === 'username' || e.target.name === 'email') update(); });
      input.form.addEventListener('reset', function () { setTimeout(update, 0); });
    }
    update();
  });

  // Reset page: take the one-time token out of the address bar (and out of history) straight away
  var resetForm = $('#reset-form');
  if (resetForm) {
    resetForm.elements.token.value = new URLSearchParams(window.location.search).get('token') || '';
    if (window.location.search) history.replaceState(null, '', window.location.pathname);
    if (!resetForm.elements.token.value) {
      var resetError = $('[data-form-error]', resetForm);
      resetError.textContent = 'This reset link is incomplete. Ask for a new one on the Forgot password page.';
      resetError.hidden = false;
    }
  }

  /* ---------- Forms: check in the browser, then (for account forms) send to the server ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // What happens after a successful account form (others just show their success message)
  var AFTER_SUCCESS = {
    login: function () { storage.remove(WISH_OWNER_KEY); window.location.href = nextUrl() || '/account'; },
    signup: function () { storage.remove(WISH_OWNER_KEY); window.location.href = nextUrl() || '/account'; },
    deleted: function () { forgetAccountWishlist(); window.location.href = '/'; }
  };

  function sendForm(form, fields, success) {
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;
    var errorBox = $('[data-form-error]', form);
    var button = $('[type="submit"]', form);
    var showError = function (message) {
      if (errorBox) { errorBox.textContent = message; errorBox.hidden = !message; } else if (message) toast(message);
    };
    var body = {};
    fields.forEach(function (f) { body[f.name] = f.type === 'checkbox' ? f.checked : f.value; });
    $$('input[type="hidden"]', form).forEach(function (f) { if (f.name) body[f.name] = f.value; });
    showError('');
    button.disabled = true;
    api('POST', form.dataset.api, body).then(function (data) {
      if (data.ok) {
        if (AFTER_SUCCESS[form.dataset.done]) return AFTER_SUCCESS[form.dataset.done](data);
        form.reset();
        fields.forEach(function (f) { f.removeAttribute('aria-invalid'); });
        if (form.hasAttribute('data-hide-on-success')) form.hidden = true;
        if (success) { success.hidden = false; success.focus(); }
        form.dispatchEvent(new CustomEvent('api:success', { detail: data }));
        return;
      }
      var first = null;
      Object.keys(data.errors || {}).forEach(function (name) {
        var field = form.elements[name];
        if (!field || !field.id) return;
        var error = document.getElementById(field.id + '-error');
        if (error) error.textContent = data.errors[name];
        field.setAttribute('aria-invalid', 'true');
        if (!first) first = field;
      });
      if (first) first.focus();
      showError(data.error || (first ? '' : 'Something went wrong. Please try again.'));
    }).catch(function () {
      showError(session.offline ? OFFLINE_MESSAGE : "We couldn't reach StayNest. Check your connection and try again.");
    }).then(function () { button.disabled = false; });
  }

  $$('form[data-validate]').forEach(function (form) {
    var fields = $$('input, select, textarea', form).filter(function (f) { return f.name && f.type !== 'hidden'; });
    var success = document.getElementById(form.dataset.success);

    function check(field) {
      var value = field.type === 'checkbox' ? (field.checked ? 'on' : '') : field.value.trim();
      var match = field.dataset.match && document.getElementById(field.dataset.match);
      var message = '';
      if (field.required && !value) message = field.dataset.required || 'Please fill in this field.';
      else if (match && field.value !== match.value) message = field.dataset.matchMessage || "These fields don't match.";
      else if (field.type === 'email' && value && !EMAIL_RE.test(value)) message = 'Enter a valid email, like name@example.com.';
      else if (field.minLength > 0 && value && value.length < field.minLength) message = 'Please write at least ' + field.minLength + ' characters (you have ' + value.length + ').';
      else if (field.dataset.pattern && value && !new RegExp(field.dataset.pattern).test(value)) message = field.dataset.patternMessage || 'Please check this field.';
      else if (Rules && field.dataset.rule === 'username') message = Rules.usernameProblem(value);
      else if (Rules && field.hasAttribute('data-strength') && field.value) message = Rules.passwordProblem(field.value, ruleContext(form));
      var error = document.getElementById(field.id + '-error');
      if (error) error.textContent = message;
      if (message) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid');
      return !message;
    }

    fields.forEach(function (field) {
      field.addEventListener('blur', function () { if (field.value.trim()) check(field); });
      field.addEventListener('input', function () { if (field.getAttribute('aria-invalid') === 'true') check(field); });
      field.addEventListener('change', function () { if (field.tagName === 'SELECT') check(field); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var invalid = fields.filter(function (f) { return !check(f); });
      if (invalid.length) {
        invalid[0].focus();
        toast(invalid.length === 1 ? 'Please fix the highlighted field.' : 'Please fix the ' + invalid.length + ' highlighted fields.');
        return;
      }
      if (form.dataset.api) { sendForm(form, fields, success); return; }
      form.reset();
      fields.forEach(function (f) { f.removeAttribute('aria-invalid'); });
      if (success) {
        success.hidden = false;
        success.focus();
      }
    });
  });

  /* ---------- Stay detail: photo lightbox ---------- */
  var gallery = $('[data-gallery]');
  var lightbox = $('#lightbox');
  if (gallery && lightbox && typeof lightbox.showModal === 'function') {
    var photos = $$('.gallery-item img', gallery).map(function (img) {
      return { src: img.dataset.full || img.src, alt: img.alt };
    });
    var lbImg = $('.lb-img', lightbox);
    var lbCount = $('.lb-count', lightbox);
    var lbCaption = $('.lb-caption', lightbox);
    var current = 0;
    var opener = null;
    var showPhoto = function (index) {
      current = (index + photos.length) % photos.length;
      var photo = photos[current];
      lbImg.classList.remove('is-in');
      lbCount.textContent = (current + 1) + ' / ' + photos.length;
      lbCaption.textContent = photo.alt;
      var pre = new Image();
      pre.onload = pre.onerror = function () {
        if (photos[current] !== photo) return; // user already moved on
        lbImg.src = photo.src;
        lbImg.alt = photo.alt;
        requestAnimationFrame(function () { lbImg.classList.add('is-in'); });
      };
      pre.src = photo.src;
    };
    var openLightbox = function (index, trigger) {
      opener = trigger;
      lightbox.showModal();
      showPhoto(index);
    };
    $$('.gallery-item', gallery).forEach(function (btn, i) {
      btn.addEventListener('click', function () { openLightbox(i, btn); });
    });
    $$('[data-open-gallery]').forEach(function (btn) {
      btn.addEventListener('click', function () { openLightbox(0, btn); });
    });
    $('.lb-prev', lightbox).addEventListener('click', function () { showPhoto(current - 1); });
    $('.lb-next', lightbox).addEventListener('click', function () { showPhoto(current + 1); });
    $('.lb-close', lightbox).addEventListener('click', function () { lightbox.close(); });
    lightbox.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') showPhoto(current - 1);
      if (e.key === 'ArrowRight') showPhoto(current + 1);
    });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target.classList.contains('lb-stage')) lightbox.close();
    });
    lightbox.addEventListener('close', function () { if (opener) opener.focus(); });
    var touchX = null;
    lightbox.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 45) showPhoto(current + (dx < 0 ? 1 : -1));
      touchX = null;
    });
  }

  /* ---------- Stay detail: price calculator in the reserve box ---------- */
  var reserve = $('[data-reserve]');
  if (reserve) {
    var price = Number(reserve.dataset.price);
    var cleaning = Number(reserve.dataset.cleaning);
    var feeRate = Number(reserve.dataset.fee);
    var rIn = reserve.elements.checkin;
    var rOut = reserve.elements.checkout;
    var breakdown = $('[data-breakdown]', reserve);
    var hint = $('[data-reserve-hint]', reserve);
    linkDates(rIn, rOut);

    var updateTotal = function () {
      var n = rIn.value && rOut.value ? nightsBetween(rIn.value, rOut.value) : 0;
      var valid = n > 0 && n <= 30;
      breakdown.hidden = !valid;
      hint.hidden = valid;
      if (!valid) {
        hint.textContent = n > 30 ? 'Stays can be up to 30 nights.' : 'Add your dates to see the total price.';
        return;
      }
      var stay = price * n;
      var fee = Math.round(stay * feeRate);
      $('[data-line="nights"]', reserve).textContent = formatPKR(price) + ' × ' + n + ' night' + (n === 1 ? '' : 's');
      $('[data-line="nights-total"]', reserve).textContent = formatPKR(stay);
      $('[data-line="cleaning"]', reserve).textContent = formatPKR(cleaning);
      $('[data-line="fee"]', reserve).textContent = formatPKR(fee);
      $('[data-line="total"]', reserve).textContent = formatPKR(stay + cleaning + fee);
    };
    rIn.addEventListener('change', updateTotal);
    rOut.addEventListener('change', updateTotal);
    updateTotal();

    reserve.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!rIn.value) { toast('Pick a check-in date first.'); rIn.focus(); return; }
      if (!rOut.value || rOut.value <= rIn.value) { toast('Pick a check-out date after check-in.'); rOut.focus(); return; }
      if (nightsBetween(rIn.value, rOut.value) > 30) { toast('Stays can be up to 30 nights.'); rOut.focus(); return; }
      var button = $('[type="submit"]', reserve);
      sessionReady.then(function () {
        if (session.offline) { toast('Lovely choice! Online booking needs the StayNest server - this copy is a design preview.'); return; }
        if (!session.user) {
          toast('Log in to reserve this stay.');
          setTimeout(function () { window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname); }, 900);
          return;
        }
        button.disabled = true;
        // the server works out the price itself; only the stay, dates and guests are sent
        return api('POST', '/api/bookings', {
          stay: reserve.dataset.stay, checkin: rIn.value, checkout: rOut.value, guests: Number(reserve.elements.guests.value)
        }).then(function (data) {
          if (data.ok) { window.location.href = '/account#trips'; return; }
          var errors = data.errors || {};
          toast(data.error || errors.checkin || errors.checkout || errors.guests || 'Something went wrong. Please try again.');
        });
      }).catch(function () {
        toast("We couldn't reach StayNest. Check your connection and try again.");
      }).then(function () { button.disabled = false; });
    });

    $$('[data-goto-reserve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        reserve.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
        rIn.focus({ preventScroll: true });
      });
    });
  }

  /* ---------- Share button ---------- */
  $$('[data-share]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var data = { title: document.title, url: window.location.href };
      if (navigator.share) {
        navigator.share(data).catch(function () { /* user closed the share sheet */ });
      } else if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(data.url).then(
          function () { toast('Link copied to your clipboard'); },
          function () { toast('Copy the link from your address bar to share'); }
        );
      } else {
        toast('Copy the link from your address bar to share');
      }
    });
  });

  /* ---------- Host page: earnings estimate ---------- */
  var calc = $('[data-earnings]');
  if (calc) {
    var citySelect = $('#calc-city', calc);
    var nightsRange = $('#calc-nights', calc);
    var nightsOut = $('#calc-nights-out', calc);
    var earningsOut = $('[data-earnings-out]', calc);
    var updateEarnings = function () {
      var nightly = Number(citySelect.value);
      var nights = Number(nightsRange.value);
      nightsOut.textContent = nights + ' night' + (nights === 1 ? '' : 's');
      nightsRange.setAttribute('aria-valuetext', nights + ' nights a month');
      var monthly = Math.round((nightly * nights * 0.97) / 500) * 500; // after a 3% host fee
      earningsOut.textContent = formatPKR(monthly);
    };
    calc.addEventListener('submit', function (e) { e.preventDefault(); });
    citySelect.addEventListener('change', updateEarnings);
    nightsRange.addEventListener('input', updateEarnings);
    updateEarnings();
  }

  /* ---------- About page: count-up stats ---------- */
  var counters = $$('[data-count-to]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion.matches) {
    var renderCount = function (el, value) {
      var decimals = Number(el.dataset.decimals || 0);
      el.textContent = (el.dataset.prefix || '') +
        value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) +
        (el.dataset.suffix || '');
    };
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countObserver.unobserve(entry.target);
        var el = entry.target;
        var target = Number(el.dataset.countTo);
        var start = performance.now();
        var duration = 600;
        var step = function (now) {
          var t = Math.min(1, (now - start) / duration);
          renderCount(el, target * (1 - Math.pow(1 - t, 3)));
          if (t < 1) requestAnimationFrame(step); else renderCount(el, target);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { renderCount(el, 0); countObserver.observe(el); });
  }

  // for js/account.js
  window.StayNest = { api: api, session: sessionReady, toast: toast, formatPKR: formatPKR, forgetWishlist: forgetAccountWishlist };
})();
