import { PlatformIcon } from '../platforms.jsx';
import { opensInNewTab, safeHref } from '../safeUrl.js';
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

/**
 * The public page itself. Used both by the real page (/:slug) and by the live preview in the admin
 * (`embedded`), so what the editor sees is exactly what visitors get.
 */
export default function ProfileView({ business, links, embedded = false, onLinkClick }) {
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
    business.coverUrl ? 'lt-has-cover' : '',
  ].join(' ');

  const renderLink = (link, className, children) => (
    <a
      key={link.id}
      className={className}
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

  return (
    <div className={cls} style={style}>
      {business.coverUrl && <div className="lt-cover" style={{ backgroundImage: `url("${business.coverUrl}")` }} />}
      <main className="lt-inner">
        <div className="lt-avatar">
          {business.logoUrl ? <img src={business.logoUrl} alt={`${business.name} logo`} /> : <span>{initials(business.name)}</span>}
        </div>
        <h1 className="lt-name">{business.name}</h1>
        {business.tagline && <p className="lt-tagline">{business.tagline}</p>}
        {business.bio && <p className="lt-bio">{business.bio}</p>}

        {icons.length > 0 && (
          <div className="lt-icons">
            {icons.map((l) => renderLink(l, 'lt-icon', <PlatformIcon platform={l.platform} />))}
          </div>
        )}

        {buttons.length > 0 && (
          <div className="lt-links">
            {buttons.map((l) =>
              renderLink(
                l,
                'lt-link',
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
      </main>
    </div>
  );
}
