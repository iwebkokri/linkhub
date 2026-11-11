# LinkHub

Link-in-bio pages for **multiple businesses**, managed from **one admin panel**.
React (Vite) front end · Node.js (Express) API · SQLite database (a single file, no database server to run).

| | |
|---|---|
| Public page | `https://your-domain/<business-slug>` |
| Admin panel | `https://your-domain/admin` |
| Directory of all live businesses | `https://your-domain/` (edit or remove in `client/src/App.jsx`) |

**Security:** see [SECURITY.md](SECURITY.md) for what's built in (2FA, hardened sessions, rate limits, anti-phishing link rules, audit log…), what it can't do alone (large DDoS floods) and the VPS checklist.

## What it does

- **Many businesses, one place.** Each business gets its own page, logo, cover, colours, fonts and links.
- **Add as many links as you like** (Facebook, Instagram, X, TikTok, YouTube, LinkedIn, WhatsApp, Telegram, Snapchat, Pinterest, Threads, Discord, Spotify, Maps, email, phone, website, custom). Show each as a **button** or a compact **icon**. Reorder, hide, edit, delete. A link is live on the public page the moment you add it. A platform's icon may only link to that platform (anti-phishing); use *Website* / *Other link* for anything else.
- **Mobile-first public page:** full-screen on a phone, a centred phone-sized card on a desktop, with gentle animations (and none for visitors who prefer reduced motion).
- **Share + QR on every page:** a share button (WhatsApp, Facebook, X, LinkedIn, Telegram, email, copy link, the phone's own share sheet) and a QR code that opens that exact page. Each share channel and the QR code tag the link, so Analytics shows how many visits came from WhatsApp, a flyer, a poster, etc. Download the QR (PNG/SVG) or print it as a poster from **Business → Share & QR**, where you can also build tagged campaign links.
- **Live phone preview** while editing - what you see is exactly what visitors get.
- **Roles.** *Administrators* see and manage everything. *Team members* are **assigned to specific businesses** and can only see and edit those (profile, links, look, analytics). Assign people from either **Team → edit person** or **Business → Team**. Disabling a person signs them out immediately.
- **Account security.** Passwords of 12+ characters, optional **two-factor authentication** (mandatory for administrators in production), "where you're signed in" with sign-out-everywhere, and an **Activity** log of who changed what.
- **Built-in analytics, per business and per link** - always on, no setup, no cookies (see below).
- **Tracking codes** - Google Analytics 4 (gtag), Google Tag Manager, Meta Pixel and TikTok Pixel, company-wide and/or per business (see below).
- Share previews (WhatsApp, Facebook, iMessage, X…) show the business name, tagline and logo.

## Built-in analytics

Every page view and every link click is stored as its own event, so each business and each individual link has its own numbers and daily history:

- **Per business:** page views, visitors, link clicks, click rate, a daily trend, where visitors came from (referring site or `?utm_source=` / `?ref=`), and device type.
- **Per link:** clicks in the selected range (7 / 30 / 90 days), share of the business's clicks, all-time clicks, and a trend sparkline.
- **Dashboard:** the same totals rolled up across every business you can access, plus a card per business.

Notes:
- **Privacy:** no cookies and no IP addresses are stored. A "visitor" is a one-way hash that changes every day, so a person is counted once *per day* and can't be followed across days. "Visitors" over a range is the sum of each day's visitors.
- Bots and link-preview crawlers (Googlebot, WhatsApp, Facebook…) are not counted. Rapid repeats from the same visitor (reload spam) are ignored, and other websites can't inflate your numbers.
- A "day" ends at midnight in `STATS_TIMEZONE` (default: the server's time zone). Individual records older than `STATS_RETENTION_DAYS` (default 2 years) are pruned; the all-time totals stay.
- Deleting a link deletes its click history. **Hide** a link instead to keep the numbers.
- Visits by the admins/team themselves are counted like anyone else's.
- Behind Nginx, set `TRUST_PROXY=1` (already in the examples), otherwise every visitor looks like the proxy's IP.

## Tracking codes (gtag & friends)

- **Company-wide:** *Tracking codes* in the admin menu (admins only). Loaded on **every** business page.
- **Per business:** *Business → Tracking codes* (admins only). Loaded only on that page, in addition to the company-wide codes. The same ID is never loaded twice.
- Supported: **Google Analytics 4** (`G-XXXXXXXXXX`), **Google Tag Manager** (`GTM-XXXXXXX`), **Meta Pixel** (numeric), **TikTok Pixel**. For anything else (LinkedIn Insight, Hotjar, Google Ads…) add it *inside* Google Tag Manager.
- **Link clicks are forwarded as events:** `link_click` to Google (parameters `link_title`, `link_platform`, `link_url`, `business`, `business_slug`, `link_id`; also pushed to the Tag Manager `dataLayer`), `LinkClick` to Meta, `ClickButton` to TikTok.
- **Consent (optional):** switch on *Ask visitors to accept cookies before these tools load* and the scripts stay off until the visitor clicks Accept. Recommended for visitors in the EU, UK and Quebec. It's **off by default** - decide with whoever handles your privacy compliance. The built-in analytics don't use cookies, so they're unaffected.
- The server's Content-Security-Policy already allows Google, Meta and TikTok. If a tag you add through Tag Manager needs another domain, list it in `CSP_EXTRA_SOURCES` in `.env` and restart.

## Run it on your computer

Needs Node.js 20+ (22 or 24 recommended).

```bash
npm run install:all            # installs root, server and client dependencies
npm run seed:demo              # optional: 2 sample businesses
npm run dev                    # API on :4000, admin/site on http://localhost:5173
```

There is **no default password**. With an empty database the server creates `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `server/.env`
(copy `server/.env.example`), or, if those are unset, a development admin with a **random password printed once in the console**.
To create or reset an admin yourself: `cd server && npm run admin -- create you@example.com --name "You" --generate`.

## Deploy to your VPS

### 1. Prepare the server (Ubuntu/Debian example)

```bash
# Node 22 (any current LTS works), Nginx, build tools for the SQLite module if a prebuilt one isn't found
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx build-essential python3 fail2ban ufw unattended-upgrades
sudo useradd --system --home /var/www/linkhub --shell /usr/sbin/nologin linkhub
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

### 2. Get the code onto the server and build

```bash
cd /var/www && git clone <your-repo> linkhub && cd linkhub    # or upload the folder
npm --prefix client ci && npm --prefix client run build        # builds client/dist
npm --prefix server ci --omit=dev
```

### 3. Configure

```bash
cp server/.env.example server/.env
nano server/.env      # set APP_SECRET, PUBLIC_URL (and STATS_TIMEZONE); read the comments
```

Generate the secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and **keep a copy in your password manager**.
The server **refuses to start** without a strong `APP_SECRET`, and it only answers for the host in `PUBLIC_URL`.

### 4. Create your administrator

```bash
cd server && NODE_ENV=production npm run admin -- create you@yourdomain.com --name "Your Name" --generate
```

It prints a strong random password **once** (store it in a password manager). It's never written to a file. On your first sign-in you'll be asked to set up two-factor authentication (an authenticator app) - required for administrators.

### 5. Run it as a locked-down service

```bash
sudo chown -R linkhub:linkhub /var/www/linkhub/server/data /var/www/linkhub/server/.env && sudo chmod 600 /var/www/linkhub/server/.env
sudo cp deploy/linkhub.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now linkhub
curl http://127.0.0.1:4000/healthz
```

(PM2 also works: `pm2 start deploy/ecosystem.config.cjs` - but the systemd unit adds a sandbox and runs as its own user.)

### 6. Nginx + HTTPS + fail2ban

```bash
sudo mkdir -p /etc/nginx/snippets && sudo cp deploy/nginx-proxy-snippet.conf /etc/nginx/snippets/linkhub-proxy.conf
sudo cp deploy/nginx.conf /etc/nginx/sites-available/linkhub        # edit the domain first
sudo ln -s /etc/nginx/sites-available/linkhub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d links.yourdomain.com
```

Point your domain's DNS **A record** at the VPS first. Then sign in at `https://links.yourdomain.com/admin`.
Set up fail2ban from `deploy/fail2ban-linkhub.conf`, and read **[SECURITY.md](SECURITY.md)** for putting Cloudflare in front (the real defence against large DDoS floods) and the rest of the VPS checklist.

### Docker instead (untested here)

`docker compose up -d --build` after creating `server/.env` (see `docker-compose.yml`). Data lives in the `linkhub-data` volume.

### Updating later

```bash
git pull && npm --prefix client ci && npm --prefix client run build && npm --prefix server ci --omit=dev
sudo systemctl restart linkhub
npm --prefix server audit --omit=dev && npm --prefix client audit      # check for known vulnerabilities
```
The database upgrades itself on start.

### Locked out? Forgot a password? Lost a phone?

There's no e-mail reset by design. On the server, in `server/`:

```bash
npm run admin -- reset you@yourdomain.com --generate      # new random password
npm run admin -- reset you@yourdomain.com --disable-2fa   # lost authenticator
npm run admin -- revoke-sessions                          # sign everyone out
```
Team members: an admin can reset their password or two-factor under **Team → edit**.

### Backups

Everything (database + uploaded images) is in `server/data/` (or `DATA_DIR`). A safe nightly database copy:

```bash
sqlite3 /var/www/linkhub/server/data/linktree.db ".backup '/var/backups/linkhub-$(date +%F).db'"
rsync -a /var/www/linkhub/server/data/uploads/ /var/backups/linkhub-uploads/
```
Copy backups **off the server** and encrypt them.

## How the project is laid out

```
server/src/            Express API (routes/, auth + sessions, stats, tracking, uploads, SQLite schema in db.js, admin-cli.js)
client/src/pages/      Public pages (business page, directory)
client/src/components/ ProfileView = the page itself (also used by the admin's live preview)
client/src/admin/      The admin panel
client/src/tracking.js Google / Meta / TikTok loaders + consent
deploy/                Nginx, systemd, fail2ban, PM2 examples
SECURITY.md            Security guide and VPS checklist
```

## Good to know

- SQLite comfortably handles many businesses and millions of events on one VPS. Run a single server process, not a cluster.
- Custom domains per business (e.g. `links.business-a.com`) aren't built in; every business lives under your one domain as `/<slug>`.
- If a legitimate link is refused ("doesn't look like an Instagram address", "look-alike characters"), that's the anti-phishing rules: choose *Website* / *Other link*, or ask an administrator (`ALLOW_PUNYCODE_LINKS`, `BLOCKED_LINK_DOMAINS` in `.env`).
