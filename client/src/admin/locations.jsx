import { Link } from 'react-router-dom';
import { PlatformIcon } from '../platforms.jsx';
import { Chip, formatNumber } from './ui.jsx';

const DEVICE = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' };

/** "Toronto, Ontario, Canada" - whatever parts are known. */
export const placeLabel = (p) => [p.city, p.region, p.countryName || p.country].filter(Boolean).join(', ');

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;
export function timeAgo(iso) {
  const secs = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(secs);
  const [value, unit] = abs < 60 ? [secs, 'second'] : abs < 3600 ? [Math.round(secs / 60), 'minute'] : abs < 86400 ? [Math.round(secs / 3600), 'hour'] : [Math.round(secs / 86400), 'day'];
  return rtf ? rtf.format(value, unit) : new Date(iso).toLocaleString();
}

/** Ranked list where each row shows views and clicks. One hue, largest first, values at the end of the bar. */
export function PlaceBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.views + r.clicks));
  return (
    <ul className="ranked">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${formatNumber(r.views)} views, ${formatNumber(r.clicks)} link clicks`}>
          <span className="ranked-name">{r.label}{r.sub && <small className="place-sub"> {r.sub}</small>}</span>
          <span className="ranked-track" aria-hidden="true">
            <span className="ranked-bar" style={{ width: `${Math.max(((r.views + r.clicks) / max) * 100, 2)}%` }} />
          </span>
          <strong className="ranked-val">{formatNumber(r.views)}<small className="place-clicks"> · {formatNumber(r.clicks)}</small></strong>
        </li>
      ))}
    </ul>
  );
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * The "where are they" cards. Handles every state: location off, database missing, nothing located yet, and data.
 * `compact` = just the countries (used on the dashboard).
 */
export function LocationSection({ locations, isAdmin, compact = false, title = 'Where visitors are' }) {
  const { precision, databaseLoaded, countries, cities, located, provider } = locations;
  const heading = <h2>{title}</h2>;

  if (countries.length === 0 && precision === 'off') {
    return (
      <section className="card" aria-label={title}>
        {heading}
        <p className="muted">Visitor location is turned off, so nothing is recorded about where visits and clicks come from.{' '}
          {isAdmin ? <Link to="/admin/settings">Turn it on in Settings</Link> : 'An administrator can turn it on.'}</p>
      </section>
    );
  }
  if (!databaseLoaded && countries.length === 0) {
    return (
      <section className="card" aria-label={title}>
        {heading}
        <p className="muted">
          The location database isn&rsquo;t installed on the server yet, so visits can&rsquo;t be placed on a map.{' '}
          {isAdmin ? <>On the server run <code>npm run geoip:update</code> in the <code>server</code> folder (it downloads a free database, about 60 MB).</> : 'Ask an administrator to install it.'}
        </p>
      </section>
    );
  }
  if (countries.length === 0) {
    return (
      <section className="card" aria-label={title}>
        {heading}
        <p className="muted">No located visits in this period yet. Locations appear as people open the page and tap links.</p>
      </section>
    );
  }

  const countryRows = countries.map((c) => ({ key: c.code, label: c.name, sub: c.code, views: c.views, clicks: c.clicks }));
  const cityRows = cities.map((c) => ({ key: `${c.city}|${c.region}|${c.code}`, label: c.city, sub: [c.region, c.code].filter(Boolean).join(', '), views: c.views, clicks: c.clicks }));
  const vp = pct(located.views.located, located.views.total);
  const cp = pct(located.clicks.located, located.clicks.total);

  return (
    <section className="card" aria-label={title}>
      <div className="card-head">
        <div>
          {heading}
          <p className="muted small">Approximate, from the visitor&rsquo;s IP address. Each row shows <strong>views</strong> then <strong>· link clicks</strong>.</p>
        </div>
      </div>
      {precision === 'off' && <div className="alert alert-warn" role="status">Visitor location is turned off, so new visits and clicks are no longer placed. This is what was recorded before.{isAdmin && <> <Link to="/admin/settings">Settings</Link></>}</div>}
      <div className={compact ? '' : 'loc-grid'}>
        <div>
          {!compact && <h3 className="loc-sub">Countries</h3>}
          <PlaceBars rows={countryRows} />
        </div>
        {!compact && (
          <div>
            <h3 className="loc-sub">Cities</h3>
            {cityRows.length ? <PlaceBars rows={cityRows} /> : <p className="muted small">City detail is not being recorded (see Settings → Visitor location).</p>}
          </div>
        )}
      </div>
      <p className="hint">
        {vp}% of views and {cp}% of clicks could be placed (private networks, VPNs and unlisted addresses can&rsquo;t). IP addresses are looked up on this server and <strong>never stored</strong>.
        {provider === 'DB-IP' && <> <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">IP Geolocation by DB-IP</a>.</>}
      </p>
    </section>
  );
}

/** The latest clicks: anonymous (no name, no IP) - when, which link, roughly where, on what device. */
export function RecentClicks({ clicks, precision }) {
  return (
    <section className="card" aria-label="Recent clicks">
      <h2>Recent clicks</h2>
      <p className="muted small">The latest link taps on this page. Visitors are anonymous: you see the device and the approximate place, never a name or an IP address.</p>
      {clicks.length === 0 ? (
        <p className="muted">No clicks yet.</p>
      ) : (
        <ul className="recent-clicks">
          {clicks.map((c) => {
            const place = placeLabel(c);
            return (
              <li key={c.id}>
                <span className="link-badge small"><PlatformIcon platform={c.platform} /></span>
                <div className="rc-main">
                  <div className="rc-line">Someone {place ? <>in <strong>{place}</strong> </> : null}tapped <strong>{c.title}</strong></div>
                  <div className="cell-sub">
                    <time dateTime={c.time} title={new Date(c.time).toLocaleString()}>{timeAgo(c.time)}</time>
                    {!place && precision !== 'off' && ' · location unknown'}
                  </div>
                </div>
                <Chip>{DEVICE[c.device] || c.device}</Chip>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
