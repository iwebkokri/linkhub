# Security guide

No website can be made "unhackable", and nothing here replaces keeping the server patched and watched.
What follows is exactly what this project does, what it deliberately leaves to the network layer, and the
checklist for the VPS.

## 1. What is built into the app

| Threat | Protection |
|---|---|
| **Guessing passwords** | Minimum 12 characters, common/guessable passwords refused. Only *failed* sign-ins are throttled, in three layers: per IP (10 / 15 min), per account from one IP (5 / 15 min), and per account from anywhere (30 / hour). Real users on a different address are not locked out by an attacker. Passwords are hashed with bcrypt (cost 12); unknown emails take the same time as wrong passwords. |
| **Stolen or phished password** | **Two-factor authentication** (authenticator-app codes, RFC 6238, with recovery codes). **Mandatory for administrators in production** - the app is locked until it's set up. A used code can't be replayed; the sign-in ticket is burned after 5 wrong codes; guessing is rate-limited. Turning it off needs the password *and* a code. |
| **Stolen session cookie** | Random 256-bit tokens, stored **hashed** (a copy of the database can't sign anyone in). Sessions end after 12 h, or 2 h idle, and are revoked instantly on logout, password change, role change, disable/delete, 2FA change, or "sign out other devices". Cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` over HTTPS. |
| **Weak handed-out passwords** | A password an administrator sets for someone else must be replaced by its owner at first sign-in (everything else is locked until then). |
| **Cross-site request forgery** | `SameSite=Strict` cookies **plus** a server check that every write comes from this site (`Origin` / `Sec-Fetch-Site`). This also stops other websites inflating your click and view counts. |
| **Phishing: fake identity on your pages** | A link with a platform's logo may only point at that platform (an "Instagram" button can't go to a look-alike login page). Links with embedded credentials (`https://paypal.com@evil.com`), raw IPs, `localhost`, look-alike (punycode) domains, `javascript:`/`data:` and `mailto:` header-injection are refused; you can add a domain blocklist. Everything is validated on the server *and* re-checked on the page. |
| **Phishing: who changed my page?** | An **Activity** log (admins only) records sign-ins, failed sign-ins, wrong 2FA codes, and every change to links, businesses, team, tracking and settings - with who, what, and from where. Passwords/codes are never logged. |
| **Host-header attacks / spoofed domains** | In production, requests for any host name other than `PUBLIC_URL` (and `ALLOWED_HOSTS`) get HTTP 421. |
| **Injection (SQL / XSS / path traversal)** | Every database query is parameterised. All input is validated against strict schemas (unknown fields dropped). React escapes output; HTML written for share-previews is escaped. A strict Content-Security-Policy blocks inline scripts. Uploads: images only (no SVG), content verified, random names, served with a sandboxing CSP. |
| **Privilege escalation** | Roles are enforced **on the server** for every request; team members can only touch assigned businesses; only admins see users, tracking codes and the audit log. |
| **Clickjacking, sniffing, leaking** | `frame-ancestors 'self'`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy` (camera/mic/location off), API responses `no-store`, admin and API are `noindex`. |
| **Floods from one address** | Per-IP limits on the API (600/min), page views/clicks (300/min) and static pages (1200/min); 429 responses are tiny JSON. Repeat views/clicks from one visitor are ignored. Statistics older than 2 years are pruned so a flood can't fill the disk forever. |
| **Slow-connection (Slowloris) attacks** | Header / request / keep-alive time-outs; request bodies capped (50 KB JSON, 5 MB upload, one file, no extra fields). |
| **Reaching the app around Nginx** | In production the app listens on `127.0.0.1` only, so rate limits and the client-IP header can't be bypassed by connecting straight to port 4000. |
| **A leaked `.env` / database** | Two-factor secrets are encrypted at rest (AES-256-GCM); recovery codes and session tokens are stored hashed; the database file is created `0600`; the app warns if `.env` is readable by other users. |
| **Vulnerable dependencies** | 0 known vulnerabilities at the time of writing (`npm audit`). Run it regularly - see section 5. |

## 2. What the app cannot do alone: real DDoS

A *distributed* flood (thousands of machines) saturates your VPS's network link or CPU **before** any
application code runs. The app's limits help against a single abusive client and password guessing, but
the only effective defence against a large flood is upstream. Use layers:

1. **Put Cloudflare (the free plan is fine) in front of the domain.** It absorbs volumetric attacks, caches
   your static files, and has an "Under Attack" mode and rate-limiting rules. Keep the VPS's real IP private.
   Then lock the firewall so only Cloudflare can reach ports 80/443 (so attackers can't bypass it), and
   configure Nginx's `real_ip` (see `deploy/nginx.conf`) so per-visitor limits still work.
2. **Nginx limits** (`deploy/nginx.conf`): per-IP request and connection limits, a much stricter limit on the
   sign-in endpoints, short time-outs, body-size caps. Optionally let Nginx serve `/assets` and `/uploads` itself.
3. **fail2ban** (`deploy/fail2ban-linkhub.conf`): firewalls addresses that keep failing to sign in or keep
   hitting the rate limits.
4. **Your hosting provider's DDoS protection.** Ask what they include; some (OVH, Hetzner, DigitalOcean, Vultr
   and others) offer network-level mitigation. Know how to contact them in an attack.

## 3. Phishing beyond the app

- Attackers will phish **your domain's name** and your staff. Set up **SPF, DKIM and DMARC (`p=quarantine`, then
  `p=reject`)** for your domain (e.g. `yourdomain.com`) so nobody can send convincing e-mail "from" you.
- Protect the accounts that *control* the site with 2FA too: your **domain registrar, DNS (Cloudflare), VPS
  provider and GitHub**. Turn on the registrar lock. These matter as much as the app's own login.
- Consider **CAA** DNS records (only your certificate authority may issue certificates) and watch for
  look-alike domains of yours.
- Tell your team: the sign-in page is only ever on your own domain over `https`; LinkHub never asks for a
  password by e-mail or message; use a password manager.
- The 2FA used here (authenticator codes) stops a stolen password, but a live "relay" phishing page can still
  trick someone into typing a fresh code. The step beyond it is passkeys/WebAuthn (not built in).

## 4. VPS hardening checklist (Ubuntu/Debian)

- [ ] Create a non-root sudo user; **SSH keys only** (`PasswordAuthentication no`, `PermitRootLogin no`); consider a non-standard SSH source restriction.
- [ ] **Firewall**: `sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable`. Never open port 4000.
- [ ] **Automatic security updates**: `sudo apt install unattended-upgrades`.
- [ ] Run the app as its **own unprivileged user** with the provided `deploy/linkhub.service` (sandboxed).
- [ ] `chmod 600 server/.env`; the `server/data` folder owned by the app user only.
- [ ] **HTTPS** with Let's Encrypt (`certbot --nginx`); keep HSTS on.
- [ ] Install **fail2ban**; keep Nginx logs rotating (`logrotate`).
- [ ] **Backups**: nightly copy of `server/data` (SQLite `.backup` + uploads) to somewhere *off* the server, encrypted. Test a restore.
- [ ] **Uptime monitoring** (UptimeRobot etc.) on `https://your-domain/healthz`, with alerts to your phone.
- [ ] Reboot after kernel updates; check `journalctl -u linkhub` and the **Activity** page now and then.

## 5. Running it safely over time

- **Patching**: every month (and after any security news) run on the server:
  `git pull && npm --prefix server ci --omit=dev && npm --prefix client ci && npm --prefix client run build && sudo systemctl restart linkhub`,
  then `npm --prefix server audit --omit=dev` and `npm --prefix client audit`. Keep Node on a supported LTS release.
- **Keep `APP_SECRET` safe and stable.** It encrypts people's 2FA secrets. If it's lost or changed, 2FA stops
  working for everyone (sessions and passwords are unaffected) - recover each person with
  `npm run admin -- reset <email> --disable-2fa`, and have them set it up again.
- **Locked out / lost phone** (there is no e-mail reset by design): on the server, in `server/`:

  ```bash
  npm run admin -- reset you@yourdomain.com --generate            # new random password, printed once
  npm run admin -- reset you@yourdomain.com --disable-2fa         # lost authenticator (recovery codes also work)
  npm run admin -- create new.admin@yourdomain.com --name "Name" --generate
  npm run admin -- change-email old@yourdomain.com new@yourdomain.com
  ```
- **Suspect a compromise?** (1) `npm run admin -- revoke-sessions` signs everyone out. (2) Reset the passwords
  and 2FA of any account that may be affected. (3) Read the **Activity** page for what changed, and review
  every link on every page. (4) Rotate anything else that was on the server. (5) Restore from a clean backup if unsure.
- **Team hygiene**: give people the *Team member* role, assigned only to their own businesses; remove people
  when they leave (**Team -> trash icon** or disable them: they're signed out at once).

## 6. Not covered (be aware)

- No web-application firewall, malware scanning, or Google Safe Browsing check of the links people add (the
  Activity log and the platform/domain rules are the controls). A trusted person who is *authorised* to add
  links can still add a harmful ordinary-looking website link: review the Activity log.
- No e-mail alerts - the Activity page is pull, not push.
- Image uploads are not re-encoded, so GPS metadata inside a photo is not stripped.
- A single server is a single point of failure; there is no automatic failover.

Found a problem? Fix it, and add a test in the same change.
