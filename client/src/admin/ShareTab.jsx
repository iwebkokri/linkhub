import { useRef, useState } from 'react';
import { FaCopy, FaDownload, FaPrint } from 'react-icons/fa6';
import { copyToClipboard } from '../clipboard.js';
import { PrintableQr, QrTile, printQr, qrUrl } from '../components/qr.jsx';
import { useToast } from './toast.jsx';

const IDEAS = ['instagram', 'facebook', 'whatsapp', 'email', 'flyer', 'newsletter', 'poster'];

export default function ShareTab({ business }) {
  const toast = useToast();
  const printImg = useRef(null);
  const [source, setSource] = useState('');
  const [qrBroken, setQrBroken] = useState(false);

  const url = `${window.location.origin}/${business.slug}`;
  const clean = source.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  const tagged = clean ? `${url}?utm_source=${clean}` : url;

  const copy = async (text, what) => {
    if (await copyToClipboard(text)) toast.success(`${what} copied`);
    else toast.error('Could not copy automatically - select the text and press Ctrl+C');
  };

  const live = business.isActive && !qrBroken;

  return (
    <div className="share-grid">
      <section className="card qr-card" aria-label="QR code">
        <h2>QR code</h2>
        <p className="muted small">Anyone who scans it opens this page. Put it on posters, menus, business cards or screens.</p>
        {live ? (
          <>
            <QrTile key={business.slug} slug={business.slug} name={business.name} onError={() => setQrBroken(true)} />
            <div className="row-gap center">
              <a className="btn btn-sm" href={qrUrl(business.slug, '?format=png&size=1200&download=1')} download><FaDownload aria-hidden="true" /> PNG</a>
              <a className="btn btn-sm" href={qrUrl(business.slug, '?format=svg&download=1')} download><FaDownload aria-hidden="true" /> SVG</a>
              <button className="btn btn-sm btn-primary" onClick={() => printQr(printImg.current)}><FaPrint aria-hidden="true" /> Print poster</button>
            </div>
            <p className="hint">SVG stays sharp at any size, so use it for large prints. Scans show up in Analytics as the source <code>qr</code>.</p>
            <PrintableQr business={business} innerRef={printImg} />
          </>
        ) : (
          <div className="alert alert-warn">
            {business.isActive ? 'The QR code could not be loaded.' : 'This page is hidden, so its QR code would lead to "page not found". Publish the page first (Profile tab → Published).'}
          </div>
        )}
      </section>

      <div>
        <section className="card" aria-label="Page link">
          <h2>Page link</h2>
          <div className="link-box">
            <input readOnly value={url} aria-label="Page link" onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => copy(url, 'Link')}><FaCopy aria-hidden="true" /> Copy</button>
          </div>
          <p className="hint">Visitors can also use the <strong>share</strong> and <strong>QR</strong> buttons at the top of the page itself.</p>
        </section>

        <section className="card" aria-label="Track a campaign">
          <h2>Track where a link was shared</h2>
          <p className="muted small">Add a name to the link, and every visit that comes through it is counted under that name in <strong>Analytics → Where visitors come from</strong>.</p>
          <label className="field">
            <span className="field-label">Where will you share it?</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. flyer, newsletter, instagram-bio" maxLength={40} />
          </label>
          <div className="idea-chips">
            {IDEAS.map((i) => (
              <button key={i} type="button" className={`idea-chip ${clean === i ? 'is-on' : ''}`} onClick={() => setSource(i)}>{i}</button>
            ))}
          </div>
          <div className="link-box" style={{ marginTop: 14 }}>
            <input readOnly value={tagged} aria-label="Tagged link" onFocus={(e) => e.target.select()} />
            <button className="btn btn-primary" onClick={() => copy(tagged, 'Tagged link')}><FaCopy aria-hidden="true" /> Copy</button>
          </div>
          <p className="hint">Letters, numbers, dots, dashes and underscores only. The share buttons on the page already tag their links with <code>whatsapp</code>, <code>facebook</code>, <code>x</code>, <code>linkedin</code>, <code>telegram</code>, <code>email</code>, <code>link</code> and <code>share</code>.</p>
        </section>
      </div>
    </div>
  );
}
