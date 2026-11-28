# StayNest

StayNest is a made-up stay and home-rental brand for Pakistan (cabins in Hunza, havelis in Lahore, sea-view flats in Karachi). The pages are plain HTML, CSS and vanilla JavaScript. A small **Node.js + Express** server with a **SQLite** database adds real accounts (sign up, log in, password reset) and bookings you can create, change and cancel.

- **Live site:** https://tauseefxblaze-crypto.github.io/airbnb-system-glitchX/
- **Code:** https://github.com/tauseefxblaze-crypto/airbnb-system-glitchX

## How to run it

You need [Node.js](https://nodejs.org) 24 (it has SQLite built in).

1. Open a terminal in this folder.
2. Install the packages once: `npm install`
3. Start the server: `npm start`
4. Open **http://localhost:3000**

Accounts are saved in `data/staynest.db`, created on first start. Delete that file to start with an empty database.

**Password reset emails** don't go out by email yet. They are written to `data/mail.log` (the dev mailbox), and the terminal says when one arrives. Open the link inside to reset the password.

**Run the tests:** `npm test` (18 automated tests, using a throwaway in-memory database).

> The **live site** on GitHub Pages can't run a server, so it is a design preview: the pages work, but log-in, sign-up and booking say they need the StayNest server. To put accounts online, host it on Railway (see *Going live* below).

Every page links to the others, so you can browse the whole site from the home page.

> Keep the internet on. The fonts (Google Fonts), photos (Unsplash) and the map on the stay page load from the web. Without internet the layout still works, but you see fallback fonts and "Photo unavailable" boxes.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home: hero with search, categories, featured stays, destinations, why StayNest, experiences, guest quote, host call-to-action |
| `stays.html` | All 12 stays with live search, category filters, sort by price or rating, and a "Saved" wishlist view |
| `stay-detail.html` | One stay (Glass Cabin, Hunza): photo gallery with a full-screen viewer, amenities, map, reviews, and a price calculator for the chosen dates |
| `experiences.html` | Things to do, with category filters |
| `destinations.html` | Destination mosaic and a "best time to visit" guide by season |
| `host.html` | Become a host: steps, an earnings estimator, host stories and a hosting FAQ |
| `about.html` | Story, animated stats, timeline, values and team |
| `help.html` | Searchable FAQ accordion and a contact form with validation |
| `login.html` | Log in with username or email, password and "Remember me" |
| `signup.html` | Create an account: username, email, password (with a live strength meter) and confirm password |
| `forgot.html` / `reset.html` | Ask for a reset link, then choose a new password from the link |
| `/account` (`account.html`) | Your private account: trips, saved stays, email, change password, signed-in devices, delete account |
| `/user/<username>` (`user.html`) | Public profile: username, avatar letter and join month only |
| `403.html`, `404.html`, `500.html` | Friendly error pages |

## Folder structure

```
index.html … 500.html    one HTML file per page
css/style.css            all styles (shared by every page)
js/main.js               all behaviour (shared by every page), including talking to the server
js/password-rules.js     username / email / password rules, used by the browser AND the server
js/account.js            the account page
img/logo.png             GlitchX Studio logo (header, footer and browser-tab icon)
server.js                Express server: pages + the /api routes
db.js                    SQLite tables (users, sessions, password_resets, bookings, wishlist)
test/auth.test.js        automated tests (npm test)
data/                    database and dev mailbox (created on first start, not in git)
```

## Features

- **Responsive and mobile-first**: tested at 360px, 768px, 1024px, 1366px and 1920px with no sideways scrolling.
- **Night mode**: the site follows your device's light or dark setting. The moon/sun button overrides it until the device setting changes.
- **Wishlist**: tap a heart on any stay or experience. Saved items are counted in the header and listed at *Stays → Saved*. Logged out, they stay on this device; logged in, they are saved to your account and follow you to any device.
- **Working filters**: search, category chips and sorting on the stays and experiences pages. Links like `stays.html?type=cabins` or `stays.html?where=Lahore` open pre-filtered.
- **Photo viewer**: click any photo on the stay page. It supports arrow keys, swipe on phones and Esc to close.
- **Price calculator**: pick dates on the stay page to see nights, cleaning fee, service fee and total.
- **Help centre**: type in the FAQ search to filter answers live. The contact form checks each field and shows clear error messages.
- **Accounts**: sign up, log in on any device, "Remember me", log out (header button, or the ☰ menu on phones), log out of all devices, sign out one device, change password, forgot password, delete account.
- **Bookings (CRUD)**: reserve the Glass Cabin on the stay page (create), see it under *Your trips* (read), change dates or guests (update) and cancel it (delete). The server works out the price itself.
- **Animations**: sections fade and slide up as you scroll, cards lift on hover and their photos zoom, and buttons, menus, the accordion and the gallery have smooth transitions. Everything turns off when the system's "reduce motion" setting is on.
- **Loading shimmer**: photo boxes shimmer until the image arrives.
- **Accessibility**: a "Skip to content" link, full keyboard use, visible focus rings, labelled buttons and form fields, alt text on every photo, and colours checked for contrast.
- **Back-to-top button**, a per-page title and description, and a favicon.

## Design

- **Fonts:** Fraunces (headings) and Manrope (text).
- **Logo and colours:** taken from the GlitchX Studio logo. Light mode is clean white with navy `#0f1b2a` and deep cyan `#0a6f94`. Night mode uses deep navy `#0a111a` with electric cyan `#45c8ee`.
- **Prices** are in Pakistani rupees (PKR).

## Security

- Passwords are hashed with **bcrypt** and never stored or logged in plain text.
- The password rule (at least 8 characters, live Bad / Good / Strong meter) runs in the browser for speed **and again on the server**. "Bad" passwords (short, common, only one kind of character, or containing your username) are refused.
- Wrong log-in details always get "Incorrect username or password". After **5 failed tries** from one IP for one account, that log-in is locked for 15 minutes (and an IP is locked after 20 failures across accounts).
- Sessions use a random token in an **httpOnly, SameSite=Lax** cookie (also **Secure** in production). Only a SHA-256 of the token is stored. Every log-in gets a brand-new session, and logging out deletes it on the server.
- **CSRF**: every request that changes data must send a token that a page on another site can't read.
- All SQL uses **parameters** (no SQL injection). User text is escaped on the server and set with `textContent` in the browser (no XSS).
- **Helmet** sets security headers, including a Content-Security-Policy.
- Private pages and data are checked **on the server**: `/account` and `/api/account` always use the logged-in session, never an ID from the URL, and touching someone else's booking or device returns **403**.
- Email, password and the internal user ID never appear in URLs or on public pages. Reset links are one-time and expire after 30 minutes.

## Going live (Railway)

1. Sign in at [railway.com](https://railway.com) with GitHub, then **New Project → Deploy from GitHub repo** and pick this repository. Railway runs `npm install` and `npm start` by itself.
2. In the service's **Variables**, add `NODE_ENV` = `production` (secure cookies and the HTTPS redirect).
3. Add a **Volume** to the service, mounted at `/data`. The database and `mail.log` are saved there, so accounts survive restarts and redeploys.
4. In **Settings → Networking**, click **Generate Domain**. That `….up.railway.app` address is the live site.

Railway tells the app its volume and its web address, so nothing else needs setting. Every push to `main` redeploys the site. Password-reset emails appear in the service's **Deploy Logs**, which only you can see.

On another host, set these instead:

| Variable | Example | Why |
|---|---|---|
| `NODE_ENV` | `production` | Secure cookies and the HTTPS redirect |
| `APP_URL` | `https://staynest.example.com` | Used in reset links and the HTTPS redirect (required in production) |
| `PORT` | `3000` | Most hosts set this for you |
| `DB_PATH` | `/data/staynest.db` | Keep the database on a disk that survives restarts |

## Notes and limits

- Reset emails go to `data/mail.log` and the server log, not a real inbox. Connect an email service (such as Resend or SendGrid) in `sendMail` in `server.js` before real users rely on it.
- Log-in lockout counters are kept in memory, so they reset when the server restarts.
- Only the Glass Cabin can be booked online, and the contact form still doesn't send anything.
- On GitHub Pages (no server) the account features show a "needs the StayNest server" message.
- Every stay card opens the same sample stay page (`stay-detail.html`).
- The brand, people, reviews and numbers are made up for the demo. The team uses initial avatars instead of photos of real people.

## Credits

- Photos: [Unsplash](https://unsplash.com), free to use under the Unsplash License.
- Fonts: [Google Fonts](https://fonts.google.com): Fraunces and Manrope.
- Map: [OpenStreetMap](https://www.openstreetmap.org) contributors.
