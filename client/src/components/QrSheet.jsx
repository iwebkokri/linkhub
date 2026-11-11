import { useRef } from 'react';
import { FaDownload, FaPrint } from 'react-icons/fa6';
import Sheet from './Sheet.jsx';
import { PrintableQr, QrTile, printQr, qrUrl } from './qr.jsx';

/** "QR code" on the public page: scan it to open this exact page; download it or print it as a poster. */
export default function QrSheet({ business, onClose }) {
  const printImg = useRef(null);
  return (
    <Sheet title="Scan to open" onClose={onClose}>
      <QrTile slug={business.slug} name={business.name} />
      <p className="lt-qr-hint">Point your phone&rsquo;s camera at the code to open <strong>{business.name}</strong>.</p>
      <div className="lt-sheet-actions">
        <a className="lt-sbtn" href={qrUrl(business.slug, '?format=png&size=1200&download=1')} download>
          <FaDownload aria-hidden="true" /> PNG
        </a>
        <a className="lt-sbtn" href={qrUrl(business.slug, '?format=svg&download=1')} download>
          <FaDownload aria-hidden="true" /> SVG
        </a>
        <button type="button" className="lt-sbtn lt-sbtn-dark" onClick={() => printQr(printImg.current)}>
          <FaPrint aria-hidden="true" /> Print
        </button>
      </div>
      <PrintableQr business={business} innerRef={printImg} />
    </Sheet>
  );
}
