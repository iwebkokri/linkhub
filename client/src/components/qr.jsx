import { createPortal } from 'react-dom';
import { pageUrl } from './ShareSheet.jsx';

export const qrUrl = (slug, params = '') => `/api/public/businesses/${encodeURIComponent(slug)}/qr${params}`;

/** The QR image with a "scanner" animation: corner brackets and a sweeping line. */
export function QrTile({ slug, name, size = 248, onError }) {
  return (
    <div className="lt-qr-tile" style={{ width: size, height: size }}>
      <img src={qrUrl(slug, '?format=svg')} alt={`QR code that opens ${name}`} onError={onError} />
      <i className="lt-qr-corner tl" /><i className="lt-qr-corner tr" /><i className="lt-qr-corner bl" /><i className="lt-qr-corner br" />
      <i className="lt-qr-scan" />
    </div>
  );
}

/**
 * A poster-style layout (name, big QR, address). It is invisible on screen and is the ONLY thing that
 * shows when printing, because printQr() marks the page as "printing" first.
 */
export function PrintableQr({ business, innerRef }) {
  const address = pageUrl(business.slug).replace(/^https?:\/\//, '');
  return createPortal(
    <div className="lt-qr-sheet" aria-hidden="true">
      <h1>{business.name}</h1>
      {business.tagline && <p className="lt-qr-sheet-sub">{business.tagline}</p>}
      <img ref={innerRef} src={qrUrl(business.slug, '?format=png&size=1000')} alt="" />
      <p className="lt-qr-sheet-cta">Scan with your phone camera to open</p>
      <p className="lt-qr-sheet-url">{address}</p>
    </div>,
    document.body,
  );
}

export function printQr(img) {
  const go = () => {
    document.body.classList.add('lt-printing');
    const done = () => {
      document.body.classList.remove('lt-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };
  if (!img || img.complete) go();
  else img.addEventListener('load', go, { once: true });
}
