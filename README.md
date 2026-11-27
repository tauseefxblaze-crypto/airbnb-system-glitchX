# StayNest: front-end layout

StayNest is a made-up stay and home-rental brand for Pakistan (cabins in Hunza, havelis in Lahore, sea-view flats in Karachi). This folder holds the **front-end layout only**: plain HTML, CSS and vanilla JavaScript. There is no backend, database, real accounts or real booking.

- **Live site:** https://tauseefxblaze-crypto.github.io/airbnb-system-glitchX/
- **Code:** https://github.com/tauseefxblaze-crypto/airbnb-system-glitchX

## How to open it

Open the **live site** link above, or run it from your computer:

1. Open this folder.
2. Double-click **`index.html`**. It opens in your browser.

You need no install, build step or server. Every page links to the others, so you can browse the whole site from the home page.

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
| `login.html` | Log in form (email, password, "keep me logged in") with validation. It's linked from the header on every page |
| `signup.html` | Create-an-account form (name, email, password, confirm password, accept terms) with validation. It's linked from the log-in page |
| `404.html` | Friendly "page not found" page |

## Folder structure

```
index.html … 404.html   one HTML file per page
css/style.css           all styles (shared by every page)
js/main.js              all behaviour (shared by every page)
img/logo.png            GlitchX Studio logo (header, footer and browser-tab icon)
```

## Features

- **Responsive and mobile-first**: tested at 360px, 768px, 1024px, 1366px and 1920px with no sideways scrolling.
- **Night mode**: the moon/sun button in the header switches to the logo's dark navy and cyan look. Your choice is remembered, and the first visit follows your system setting.
- **Wishlist**: tap a heart on any stay or experience. Saved items are remembered (localStorage), counted in the header, and listed at *Stays → Saved*.
- **Working filters**: search, category chips and sorting on the stays and experiences pages. Links like `stays.html?type=cabins` or `stays.html?where=Lahore` open pre-filtered.
- **Photo viewer**: click any photo on the stay page. It supports arrow keys, swipe on phones and Esc to close.
- **Price calculator**: pick dates on the stay page to see nights, cleaning fee, service fee and total.
- **Help centre**: type in the FAQ search to filter answers live. The contact form checks each field and shows clear error messages.
- **Log in and sign up**: a button in the header (inside the ☰ menu on phones) opens the log-in page, which links to sign-up and back. The forms check every field, including that both passwords match and the terms box is ticked.
- **Animations**: sections fade and slide up as you scroll, cards lift on hover and their photos zoom, and buttons, menus, the accordion and the gallery have smooth transitions. Everything turns off when the system's "reduce motion" setting is on.
- **Loading shimmer**: photo boxes shimmer until the image arrives.
- **Accessibility**: a "Skip to content" link, full keyboard use, visible focus rings, labelled buttons and form fields, alt text on every photo, and colours checked for contrast.
- **Back-to-top button**, a per-page title and description, and a favicon.

## Design

- **Fonts:** Fraunces (headings) and Manrope (text).
- **Logo and colours:** taken from the GlitchX Studio logo. Light mode is clean white with navy `#0f1b2a` and deep cyan `#0a6f94`. Night mode uses deep navy `#0a111a` with electric cyan `#45c8ee`.
- **Prices** are in Pakistani rupees (PKR).

## Notes and limits

- This is a **design preview**. "Reserve", the contact form and the log-in and sign-up forms show a friendly message but don't send or save anything. No account is created or checked, and real accounts need a backend.
- Every stay card opens the same sample stay page (`stay-detail.html`).
- The brand, people, reviews and numbers are made up for the demo. The team uses initial avatars instead of photos of real people.

## Credits

- Photos: [Unsplash](https://unsplash.com), free to use under the Unsplash License.
- Fonts: [Google Fonts](https://fonts.google.com): Fraunces and Manrope.
- Map: [OpenStreetMap](https://www.openstreetmap.org) contributors.
