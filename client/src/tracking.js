// Third-party tracking for the PUBLIC pages: Google Analytics 4 (gtag), Google Tag Manager,
// Meta Pixel and TikTok Pixel. The ids come from the server (company-wide + per-business).
//
// Every business page is reached with a normal browser navigation (never a client-side route
// change), so one page load only ever carries that business' own tracking codes.

const loaded = { ga4: new Set(), gtm: new Set(), meta: new Set(), tiktok: new Set() };

function addScript(src) {
  const el = document.createElement('script');
  el.async = true;
  el.src = src;
  document.head.appendChild(el);
}

function loadGA4(ids) {
  const fresh = ids.filter((id) => !loaded.ga4.has(id));
  if (!fresh.length) return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // gtag must push the `arguments` object itself (not an array) - hence a plain function.
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
  }
  if (!loaded.ga4.size) addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(fresh[0])}`);
  for (const id of fresh) {
    window.gtag('config', id); // sends the page_view
    loaded.ga4.add(id);
  }
}

function loadGTM(ids) {
  window.dataLayer = window.dataLayer || [];
  for (const id of ids) {
    if (loaded.gtm.has(id)) continue;
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`);
    loaded.gtm.add(id);
  }
}

function loadMeta(ids) {
  const fresh = ids.filter((id) => !loaded.meta.has(id));
  if (!fresh.length) return;
  if (!window.fbq) {
    const fbq = (window.fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    addScript('https://connect.facebook.net/en_US/fbevents.js');
  }
  for (const id of fresh) {
    window.fbq('init', id);
    loaded.meta.add(id);
  }
  window.fbq('track', 'PageView');
}

function loadTikTok(ids) {
  const fresh = ids.filter((id) => !loaded.tiktok.has(id));
  if (!fresh.length) return;
  if (!window.ttq) {
    const name = 'ttq';
    window.TiktokAnalyticsObject = name;
    const ttq = (window[name] = window[name] || []);
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    ttq.setAndDefer = (target, method) => {
      target[method] = (...args) => target.push([method, ...args]);
    };
    ttq.methods.forEach((m) => ttq.setAndDefer(ttq, m));
    ttq.instance = (id) => {
      const inst = ttq._i[id] || [];
      ttq.methods.forEach((m) => ttq.setAndDefer(inst, m));
      return inst;
    };
    ttq.load = (id, options) => {
      const src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {};
      ttq._i[id] = [];
      ttq._i[id]._u = src;
      ttq._t = ttq._t || {};
      ttq._t[id] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[id] = options || {};
      addScript(`${src}?sdkid=${encodeURIComponent(id)}&lib=${name}`);
    };
  }
  for (const id of fresh) {
    window.ttq.load(id);
    loaded.tiktok.add(id);
  }
  window.ttq.page();
}

export function hasTracking(t) {
  return !!t && [t.ga4, t.gtm, t.metaPixel, t.tiktokPixel].some((list) => list?.length);
}

/** Load every configured tracker. Safe to call more than once. */
export function initTracking(t) {
  if (!hasTracking(t)) return;
  try {
    loadGA4(t.ga4 || []);
    loadGTM(t.gtm || []);
    loadMeta(t.metaPixel || []);
    loadTikTok(t.tiktokPixel || []);
  } catch (err) {
    console.warn('Tracking could not be started', err);
  }
}

/** Forward a link click to whichever trackers are running, so it also shows up in Google / Meta / TikTok. */
export function trackLinkClick(link, business) {
  const params = {
    link_id: link.id,
    link_title: link.title,
    link_platform: link.platform,
    link_url: link.url,
    business: business.name,
    business_slug: business.slug,
  };
  try {
    if (loaded.ga4.size && window.gtag) {
      window.gtag('event', 'link_click', params); // also visible to Tag Manager through the dataLayer
    } else if (loaded.gtm.size && window.dataLayer) {
      window.dataLayer.push({ event: 'link_click', ...params });
    }
    if (loaded.meta.size && window.fbq) {
      window.fbq('trackCustom', 'LinkClick', { link_title: link.title, link_platform: link.platform, business: business.name });
    }
    if (loaded.tiktok.size && window.ttq) {
      window.ttq.track('ClickButton', { content_name: link.title, content_category: business.name });
    }
  } catch {
    /* tracking must never break the page */
  }
}

/** Forward a "share" of the page (which channel was used) to Google / Meta, if they are running. */
export function trackShare(channel, business) {
  try {
    const params = { method: channel, content_type: 'link_page', item_id: business.slug, business: business.name };
    if (loaded.ga4.size && window.gtag) {
      window.gtag('event', 'share', params); // GA4's recommended "share" event
    } else if (loaded.gtm.size && window.dataLayer) {
      window.dataLayer.push({ event: 'share', ...params });
    }
    if (loaded.meta.size && window.fbq) window.fbq('trackCustom', 'Share', { method: channel, business: business.name });
  } catch {
    /* tracking must never break the page */
  }
}

// ---- cookie / tracking consent ---------------------------------------------

const CONSENT_KEY = 'lt_consent';

/** 'granted' | 'denied' | null (not asked yet) */
export function getConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

export function storeConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* private mode etc. - the choice just won't be remembered */
  }
}
