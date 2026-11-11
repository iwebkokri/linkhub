import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ProfileView from '../components/ProfileView.jsx';
import { getConsent, hasTracking, initTracking, storeConsent, trackLinkClick, trackShare } from '../tracking.js';
import NotFound from './NotFound.jsx';

// React StrictMode runs effects twice in development; this keeps a page load to one recorded view.
const viewed = new Set();

function recordView(slug) {
  if (viewed.has(slug)) return;
  viewed.add(slug);
  const q = new URLSearchParams(window.location.search);
  fetch(`/api/public/businesses/${encodeURIComponent(slug)}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referrer: document.referrer || undefined,
      utm: q.get('utm_source') || q.get('ref') || undefined,
    }),
    keepalive: true,
  }).catch(() => {});
}

function ConsentBanner({ onChoose }) {
  return (
    <div className="lt-consent" role="dialog" aria-label="Cookie consent">
      <p>We use cookies from analytics and advertising partners to understand how this page is used. Is that OK?</p>
      <div className="lt-consent-actions">
        <button type="button" onClick={() => onChoose('denied')}>Decline</button>
        <button type="button" className="lt-accept" onClick={() => onChoose('granted')}>Accept</button>
      </div>
    </div>
  );
}

export default function PublicPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [consent, setConsent] = useState(getConsent);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/public/businesses/${encodeURIComponent(slug)}`)
      .then((d) => {
        if (cancelled) return;
        setState({ status: 'ready', ...d });
        document.title = d.business.name;
        recordView(slug); // our own, cookie-less, per-business statistics
      })
      .catch((e) => !cancelled && setState({ status: e.status === 404 ? 'missing' : 'error' }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Third-party trackers (Google / Meta / TikTok). When the admin enabled "ask for consent",
  // they only start after the visitor accepts.
  const tracking = state.status === 'ready' ? state.tracking : null;
  const needsConsent = hasTracking(tracking) && tracking.requireConsent;
  useEffect(() => {
    if (!hasTracking(tracking)) return;
    if (needsConsent && consent !== 'granted') return;
    initTracking(tracking);
  }, [tracking, needsConsent, consent]);

  if (state.status === 'loading') return <div className="center-screen" aria-busy="true" />;
  if (state.status === 'missing') return <NotFound />;
  if (state.status === 'error') {
    return (
      <div className="center-screen">
        <div>
          <h1>Something went wrong</h1>
          <p>Please refresh the page to try again.</p>
        </div>
      </div>
    );
  }

  const choose = (value) => {
    storeConsent(value);
    setConsent(value);
  };

  return (
    <>
      <ProfileView
        business={state.business}
        links={state.links}
        onLinkClick={(link) => {
          // Per-link click, recorded for this link only. Fire-and-forget so the link opens instantly.
          fetch(`/api/public/links/${link.id}/click`, { method: 'POST', keepalive: true }).catch(() => {});
          trackLinkClick(link, state.business);
        }}
        onShare={(channel) => trackShare(channel, state.business)}
      />
      {needsConsent && consent === null && <ConsentBanner onChoose={choose} />}
    </>
  );
}
