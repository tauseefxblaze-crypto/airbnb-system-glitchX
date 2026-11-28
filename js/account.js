/* StayNest - the private account page (/account).
   Everything here comes from /api/account, which the server builds from the session cookie,
   never from an ID in the URL. Text is set with textContent, so nothing a user typed runs as HTML. */
(function () {
  'use strict';

  var SN = window.StayNest;
  var page = document.querySelector('[data-account]');
  if (!SN || !page) return;

  var $ = function (sel) { return page.querySelector(sel); };
  var errorBox = $('[data-account-error]');

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === 'text') node.textContent = props[key];
      else if (key in node) node[key] = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  var todayISO = function () {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  var addDays = function (iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  var nights = function (a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); };
  var formatDay = function (iso) {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  var formatTime = function (ms) {
    return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  var plural = function (n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); };

  // Turns a server reply into one readable message
  function firstError(data) {
    var errors = data.errors || {};
    return data.error || errors[Object.keys(errors)[0]] || 'Something went wrong. Please try again.';
  }

  function load() {
    return SN.api('GET', '/api/account').then(function (data) {
      if (data.status === 401) { window.location.href = '/login.html?next=/account'; return; }
      if (!data.ok) throw new Error(firstError(data));
      showError('');
      render(data);
    }).catch(function () {
      showError("We couldn't load your account. Refresh the page to try again.");
    });
  }

  function render(data) {
    var joined = new Date(data.joined).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    $('[data-account-name]').textContent = data.username;
    var initial = $('[data-account-initial]');
    var hue = 0; // same colour as the public profile (server.js)
    data.username.toLowerCase().split('').forEach(function (ch) { hue = (hue * 31 + ch.charCodeAt(0)) % 360; });
    initial.textContent = data.username.charAt(0).toUpperCase();
    initial.style.setProperty('--av', 'hsl(' + hue + ' 45% 36%)');
    $('[data-account-meta]').textContent = 'Member since ' + joined;
    var profile = $('[data-account-profile]');
    profile.href = '/user/' + encodeURIComponent(data.username);
    profile.hidden = false;
    $('[data-account-username]').textContent = data.username;
    $('[data-account-email]').textContent = data.email;
    $('[data-account-joined]').textContent = joined;
    $('[data-account-wish]').textContent = plural(data.wishlistCount, 'saved stay');
    renderTrips(data.bookings);
    renderDevices(data.devices);
  }

  /* ---------- Trips: change dates (update) and cancel (delete) ---------- */
  function renderTrips(bookings) {
    var box = $('[data-bookings]');
    box.textContent = '';
    if (!bookings.length) {
      box.appendChild(el('div', { className: 'empty-state empty-sm' }, [
        el('h3', { text: 'No trips yet' }),
        el('p', { text: 'When you reserve a stay, it shows up here.' }),
        el('a', { className: 'btn btn-primary btn-sm', href: '/stay-detail.html', text: 'Find a stay' })
      ]));
      return;
    }
    var list = el('ul', { className: 'trip-list' });
    bookings.forEach(function (b) { list.appendChild(tripItem(b)); });
    box.appendChild(list);
  }

  function tripItem(b) {
    var past = b.checkout < todayISO();
    var n = nights(b.checkin, b.checkout);
    var item = el('li', { className: 'trip' }, [
      el('div', { className: 'trip-top' }, [
        el('h3', { text: b.stayName }),
        el('span', { className: 'tag', text: past ? 'Past trip' : 'Upcoming' })
      ]),
      el('p', { className: 'muted', text: formatDay(b.checkin) + ' to ' + formatDay(b.checkout) + ' · ' + plural(n, 'night') + ' · ' + plural(b.guests, 'guest') }),
      el('p', {}, [el('strong', { text: SN.formatPKR(b.total) }), document.createTextNode(' total')])
    ]);
    if (past) return item;

    var editForm = tripForm(b);
    var editBtn = el('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Change dates' });
    editBtn.setAttribute('aria-expanded', 'false');
    editBtn.addEventListener('click', function () {
      editForm.hidden = !editForm.hidden;
      editBtn.setAttribute('aria-expanded', String(!editForm.hidden));
      if (!editForm.hidden) editForm.elements.checkin.focus();
    });
    var cancelBtn = el('button', { type: 'button', className: 'btn btn-danger-outline btn-sm', text: 'Cancel trip' });
    cancelBtn.addEventListener('click', function () {
      if (!window.confirm('Cancel your trip to ' + b.stayName + ' on ' + formatDay(b.checkin) + "? This can't be undone.")) return;
      cancelBtn.disabled = true;
      SN.api('DELETE', '/api/bookings/' + b.id).then(function (data) {
        if (!data.ok) throw new Error(firstError(data));
        SN.toast('Your trip was cancelled.');
        return load();
      }).catch(function (err) {
        cancelBtn.disabled = false;
        SN.toast(err.message || "We couldn't reach StayNest. Try again.");
      });
    });
    item.appendChild(el('div', { className: 'trip-actions' }, [editBtn, cancelBtn]));
    item.appendChild(editForm);
    return item;
  }

  function tripForm(b) {
    var id = 'trip-' + b.id;
    var today = todayISO();
    var guestSelect = el('select', { className: 'input', id: id + '-guests', name: 'guests' });
    for (var g = 1; g <= b.maxGuests; g++) guestSelect.appendChild(el('option', { value: String(g), text: plural(g, 'guest'), selected: g === b.guests }));
    var checkin = el('input', { className: 'input', type: 'date', id: id + '-in', name: 'checkin', value: b.checkin, min: today, required: true });
    var checkout = el('input', { className: 'input', type: 'date', id: id + '-out', name: 'checkout', value: b.checkout, min: addDays(b.checkin, 1), required: true });
    checkin.addEventListener('change', function () {
      if (!checkin.value) return;
      checkout.min = addDays(checkin.value, 1);
      if (checkout.value <= checkin.value) checkout.value = addDays(checkin.value, 1);
    });
    var message = el('p', { className: 'field-error', 'aria-live': 'polite' });
    var save = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Save changes' });
    var form = el('form', { className: 'trip-edit', hidden: true, noValidate: true }, [
      el('div', { className: 'form-row' }, [
        el('div', { className: 'field' }, [el('label', { htmlFor: checkin.id, text: 'Check in' }), checkin]),
        el('div', { className: 'field' }, [el('label', { htmlFor: checkout.id, text: 'Check out' }), checkout])
      ]),
      el('div', { className: 'field' }, [el('label', { htmlFor: guestSelect.id, text: 'Guests' }), guestSelect]),
      message,
      el('div', {}, [save])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkin.value || !checkout.value || checkout.value <= checkin.value) {
        message.textContent = 'Pick a check-out date after check-in.';
        return;
      }
      save.disabled = true;
      SN.api('PATCH', '/api/bookings/' + b.id, { checkin: checkin.value, checkout: checkout.value, guests: Number(guestSelect.value) })
        .then(function (data) {
          if (!data.ok) { message.textContent = firstError(data); return; }
          SN.toast('Your trip was updated.');
          return load();
        })
        .catch(function () { message.textContent = "We couldn't reach StayNest. Try again."; })
        .then(function () { save.disabled = false; });
    });
    return form;
  }

  /* ---------- Signed-in devices ---------- */
  function renderDevices(devices) {
    var list = $('[data-devices]');
    list.textContent = '';
    devices.forEach(function (d) {
      var button = el('button', { type: 'button', className: 'btn btn-outline btn-sm', text: d.current ? 'Log out' : 'Sign out' });
      button.setAttribute('aria-label', (d.current ? 'Log out of this device: ' : 'Sign out ') + d.device);
      button.addEventListener('click', function () {
        button.disabled = true;
        SN.api('DELETE', '/api/sessions/' + d.id).then(function (data) {
          if (!data.ok) throw new Error(firstError(data));
          if (data.signedOut) { SN.forgetWishlist(); window.location.href = '/login.html'; return; }
          SN.toast(d.device + ' was signed out.');
          return load();
        }).catch(function (err) {
          button.disabled = false;
          SN.toast(err.message || "We couldn't reach StayNest. Try again.");
        });
      });
      list.appendChild(el('li', { className: 'device' }, [
        el('div', {}, [
          el('strong', { text: d.device }),
          d.current ? el('span', { className: 'tag', text: 'This device' }) : null,
          el('span', { className: 'device-meta muted', text: 'Signed in ' + formatTime(d.signedIn) + ' · Last active ' + formatTime(d.lastSeen) })
        ]),
        button
      ]));
    });
  }

  $('[data-logout-all]').addEventListener('click', function (e) {
    var button = e.currentTarget;
    if (!window.confirm('Log out of StayNest on every device, including this one?')) return;
    button.disabled = true;
    SN.api('POST', '/api/sessions/revoke-all').then(function (data) {
      if (!data.ok) throw new Error(firstError(data));
      SN.forgetWishlist();
      window.location.href = '/login.html';
    }).catch(function (err) {
      button.disabled = false;
      SN.toast(err.message || "We couldn't reach StayNest. Try again.");
    });
  });

  // a password change signs out the other devices, so refresh that list
  document.getElementById('password-form').addEventListener('api:success', load);

  load();
})();
