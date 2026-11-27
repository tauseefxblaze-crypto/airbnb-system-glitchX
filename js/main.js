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
    set: function (key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }
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

  /* ---------- Dark mode (choice remembered) ---------- */
  var themeBtn = $('[data-theme-toggle]');
  function syncThemeButton() {
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      storage.set('sn-theme', next);
      syncThemeButton();
    });
  }
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
  });
  window.addEventListener('storage', function (e) {
    if (e.key === WISH_KEY) { wishlist = readWishlist(); syncHearts(); document.dispatchEvent(new CustomEvent('wishlist:change')); }
  });
  syncHearts();

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

  /* ---------- Form validation (front-end only) ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
      toast('Lovely choice! Online booking opens soon - this page is a design preview.');
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
})();
