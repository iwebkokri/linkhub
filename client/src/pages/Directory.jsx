import { useEffect, useState } from 'react';
import { api } from '../api.js';
import '../components/profile.css';

// Lists every published business. Edit the heading below, or remove this route in App.jsx if you
// don't want a public directory.
export default function Directory() {
  const [businesses, setBusinesses] = useState(null);

  useEffect(() => {
    document.title = 'Our businesses';
    api.get('/api/public/businesses').then((d) => setBusinesses(d.businesses)).catch(() => setBusinesses([]));
  }, []);

  return (
    <div className="dir-page">
      <div className="dir-inner">
        <h1>Our businesses</h1>
        <p className="dir-sub">Find all of our social pages and links in one place.</p>
        {businesses === null ? null : businesses.length === 0 ? (
          <p className="dir-sub">Nothing published yet.</p>
        ) : (
          <div className="dir-grid">
            {businesses.map((b) => (
              // A plain <a> (full page load), so every business page starts with a clean tracking state.
              <a key={b.slug} className="dir-card" href={`/${b.slug}`}>
                <span className="dir-logo" style={{ background: b.theme.button, color: b.theme.buttonText }}>
                  {b.logoUrl ? <img src={b.logoUrl} alt="" /> : b.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{b.name}</strong>
                  {b.tagline && <span className="dir-tag">{b.tagline}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
