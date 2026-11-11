import { useState } from 'react';
import { FaQrcode, FaShareNodes } from 'react-icons/fa6';
import { PlatformIcon } from '../platforms.jsx';
import { opensInNewTab, safeHref } from '../safeUrl.js';
import QrSheet from './QrSheet.jsx';
import ShareSheet from './ShareSheet.jsx';
import './profile.css';

function initials(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

// each block rises in one after the other: --i is its place in the sequence (capped so a long list doesn't take forever)
const rise = (i) => ({ '--i': Math.min(i, 14) });

/**
 * The public page, designed as a phone-sized card: full-screen on a phone, a centred card with the theme
 * colours around it on a desktop. Used by the real page (/:slug) and, `embedded`, by the live preview in the admin.
 */
export default function ProfileView({ business, links, embedded = false, onLinkClick, onShare }) {
  const [sheet, setSheet] = useState(null); // null | 'share' | 'qr'
  const t = business.theme;
  const buttons = links.filter((l) => l.display === 'button');
  const icons = links.filter((l) => l.display === 'icon');

  const style = {
    '--bg': t.background,
    '--bg2': t.background2 || t.background,
    '--text': t.text,
    '--btn': t.button,
    '--btn-text': t.buttonText,
  };
  const cls = [
    'lt-page',
    `lt-font-${t.font}`,
    `lt-shape-${t.buttonStyle}`,
    `lt-variant-${t.buttonVariant}`,
    embedded ? 'lt-embedded' : '',
  ].join(' ');

  const renderLink = (link, className, index, children) => (
    <a
      key={link.id}
      className={`${className} lt-rise`}
      style={rise(index)}
      href={safeHref(link.url)}
      target={opensInNewTab(link.url) ? '_blank' : undefined}
      rel="noopener noreferrer"
      aria-label={link.display === 'icon' ? link.title : undefined}
      title={link.display === 'icon' ? link.title : undefined}
      onClick={(e) => {
        if (embedded) e.preventDefault(); // the preview must not navigate away
        else onLinkClick?.(link);
      }}
    >
      {children}
    </a>
  );

  const open = (which) => (e) => {
    if (embedded) return e.preventDefault(); // inert inside the admin preview
    setSheet(which);
  };

  return (
    <div className={cls} style={style}>
      <main className="lt-card">
        <div
          className={`lt-hero ${business.coverUrl ? 'has-cover' : 'is-banner'}`}
          style={business.coverUrl ? { backgroundImage: `url("${business.coverUrl}")` } : undefined}
        >
          <div className="lt-actions">
            <button type="button" className="lt-action lt-rise" style={rise(0)} onClick={open('share')} aria-label="Share this page" title="Share" tabIndex={embedded ? -1 : 0}>
              <FaShareNodes aria-hidden="true" />
            </button>
            <button type="button" className="lt-action lt-rise" style={rise(1)} onClick={open('qr')} aria-label="Show QR code" title="QR code" tabIndex={embedded ? -1 : 0}>
              <FaQrcode aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="lt-body">
          <div className="lt-avatar-wrap lt-pop" style={rise(0)}>
            <div className="lt-avatar">
              {business.logoUrl ? <img src={business.logoUrl} alt={`${business.name} logo`} /> : <span>{initials(business.name)}</span>}
            </div>
          </div>
          <h1 className="lt-name lt-rise" style={rise(1)}>{business.name}</h1>
          {business.tagline && <p className="lt-tagline lt-rise" style={rise(2)}>{business.tagline}</p>}
          {business.bio && <p className="lt-bio lt-rise" style={rise(3)}>{business.bio}</p>}

          {icons.length > 0 && (
            <div className="lt-icons">
              {icons.map((l, i) => renderLink(l, 'lt-icon', 4 + i, <PlatformIcon platform={l.platform} />))}
            </div>
          )}

          {buttons.length > 0 && (
            <div className="lt-links">
              {buttons.map((l, i) =>
                renderLink(
                  l,
                  'lt-link',
                  5 + icons.length + i,
                  <>
                    <span className="lt-link-icon">
                      <PlatformIcon platform={l.platform} />
                    </span>
                    <span className="lt-link-title">{l.title}</span>
                  </>,
                ),
              )}
            </div>
          )}

          {links.length === 0 && embedded && <p className="lt-empty">Links you add will appear here.</p>}
        </div>
      </main>

      {!embedded && sheet === 'share' && <ShareSheet business={business} onClose={() => setSheet(null)} onShare={onShare} />}
      {!embedded && sheet === 'qr' && <QrSheet business={business} onClose={() => setSheet(null)} />}
    </div>
  );
}
