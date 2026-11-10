import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PlatformIcon } from '../platforms.jsx';
import { useToast } from './toast.jsx';
import { Chip, formatNumber } from './ui.jsx';
import { RangePicker, RankedBars, Sparkline, StatTile, TrendChart } from './charts.jsx';

const DEVICE_LABEL = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' };

export default function AnalyticsTab({ businessId }) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/api/businesses/${businessId}/analytics?days=${days}`)
      .then((d) => !cancelled && setReport(d))
      .catch((e) => !cancelled && toast.error(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [businessId, days, toast]);

  if (!report) return <div className="card"><p className="muted">Loading analytics…</p></div>;

  const { totals, links } = report;
  const maxClicks = Math.max(1, ...links.map((l) => l.clicks));

  return (
    <div className={loading ? 'is-refetching' : ''}>
      {/* the filter row scopes everything below it */}
      <div className="filter-row">
        <RangePicker value={days} onChange={setDays} />
        <span className="muted small">Days run midnight to midnight, {report.timezone}.</span>
      </div>

      <div className="stats">
        <StatTile label="Page views" value={formatNumber(totals.views)} />
        <StatTile label="Visitors" value={formatNumber(totals.visitors)} hint="Counted once per day" />
        <StatTile label="Link clicks" value={formatNumber(totals.clicks)} />
        <StatTile label="Click rate" value={totals.views ? `${totals.clickRate}%` : '–'} hint="Clicks per view" />
      </div>

      <TrendChart daily={report.daily} title="Traffic to this page" />

      <section className="card" aria-label="Clicks per link">
        <div className="card-head">
          <div>
            <h2>Clicks per link</h2>
            <p className="muted small">Every link is counted on its own. “All time” keeps counting beyond the selected range.</p>
          </div>
        </div>
        {links.length === 0 ? (
          <p className="muted">No links yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table link-stats">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>Clicks in range</th>
                  <th className="num">Share</th>
                  <th className="num">All time</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="cell-link">
                        <span className="link-badge small"><PlatformIcon platform={l.platform} /></span>
                        <div>
                          <div className="cell-title">{l.title} {!l.isActive && <Chip>Hidden</Chip>}</div>
                          <div className="cell-sub" title={l.url}>{l.url}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="inline-bar">
                        <span className="ranked-track" aria-hidden="true">
                          <span className="ranked-bar" style={{ width: `${l.clicks > 0 ? Math.max((l.clicks / maxClicks) * 100, 2) : 0}%` }} />
                        </span>
                        <strong>{formatNumber(l.clicks)}</strong>
                      </div>
                    </td>
                    <td className="num">{totals.clicks ? `${l.share}%` : '–'}</td>
                    <td className="num">{formatNumber(l.allTime)}</td>
                    <td><Sparkline values={l.series} width={80} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="card" aria-label="Traffic sources">
          <h2>Where visitors come from</h2>
          <p className="muted small">From the referring site, or <code>?utm_source=</code> / <code>?ref=</code> in the link you share.</p>
          <RankedBars rows={report.sources.map((s) => ({ name: s.name, value: s.views }))} emptyText="No visits in this period yet." />
        </section>
        <section className="card" aria-label="Devices">
          <h2>Devices</h2>
          <p className="muted small">Views by device type.</p>
          <RankedBars rows={report.devices.map((d) => ({ name: DEVICE_LABEL[d.name] || d.name, value: d.views }))} emptyText="No visits in this period yet." />
        </section>
      </div>
    </div>
  );
}
