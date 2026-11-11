import { useState } from 'react';
import { FaCheck, FaEllipsis, FaEnvelope, FaFacebook, FaLink, FaLinkedin, FaTelegram, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { copyToClipboard } from '../clipboard.js';
import Sheet from './Sheet.jsx';

/** The page address, tagged with where it was shared so Analytics can say "12 visits came from WhatsApp". */
export function pageUrl(slug, source) {
  const u = new URL(`/${slug}`, window.location.origin);
  if (source) u.searchParams.set('utm_source', source);
  return u.toString();
}

export default function ShareSheet({ business, onClose, onShare }) {
  const [copied, setCopied] = useState(false);
  const title = business.name;
  const text = business.tagline ? `${business.name} – ${business.tagline}` : `Check out ${business.name}`;
  const enc = encodeURIComponent;

  // each network gets its own utm_source
  const channels = [
    { key: 'whatsapp', label: 'WhatsApp', Icon: FaWhatsapp, color: '#25d366', href: (u) => `https://wa.me/?text=${enc(`${text} ${u}`)}` },
    { key: 'facebook', label: 'Facebook', Icon: FaFacebook, color: '#1877f2', href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
    { key: 'x', label: 'X', Icon: FaXTwitter, color: '#111111', href: (u) => `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(u)}` },
    { key: 'linkedin', label: 'LinkedIn', Icon: FaLinkedin, color: '#0a66c2', href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
    { key: 'telegram', label: 'Telegram', Icon: FaTelegram, color: '#229ed9', href: (u) => `https://t.me/share/url?url=${enc(u)}&text=${enc(text)}` },
    { key: 'email', label: 'Email', Icon: FaEnvelope, color: '#64748b', href: (u) => `mailto:?subject=${enc(title)}&body=${enc(`${text}\n${u}`)}` },
  ];

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copyUrl = pageUrl(business.slug, 'link');

  const copy = async () => {
    if (await copyToClipboard(copyUrl)) {
      setCopied(true);
      onShare?.('copy');
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url: pageUrl(business.slug, 'share') });
      onShare?.('native');
    } catch {
      /* the person closed the share sheet: nothing to do */
    }
  };

  let i = 0;
  return (
    <Sheet title="Share this page" onClose={onClose}>
      <div className={`lt-share-url ${copied ? 'is-copied' : ''}`}>
        <input readOnly value={copyUrl.replace(/\?utm_source=link$/, '')} aria-label="Page address" onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy}>
          {copied ? <><FaCheck aria-hidden="true" /> Copied</> : <><FaLink aria-hidden="true" /> Copy</>}
        </button>
      </div>

      <div className="lt-share-grid">
        {channels.map(({ key, label, Icon, color, href }) => (
          <a
            key={key}
            className="lt-share-item"
            style={{ '--i': i++ }}
            href={href(pageUrl(business.slug, key))}
            target={key === 'email' ? undefined : '_blank'}
            rel="noopener noreferrer"
            onClick={() => onShare?.(key)}
          >
            <span className="lt-share-dot" style={{ background: color }}><Icon aria-hidden="true" /></span>
            {label}
          </a>
        ))}
        {canNativeShare && (
          <button type="button" className="lt-share-item" style={{ '--i': i++ }} onClick={nativeShare}>
            <span className="lt-share-dot" style={{ background: '#334155' }}><FaEllipsis aria-hidden="true" /></span>
            More
          </button>
        )}
      </div>
    </Sheet>
  );
}
