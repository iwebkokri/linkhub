import { useEffect, useRef, useState } from 'react';
import { Segmented, formatNumber } from './ui.jsx';

// Colours come from CSS custom properties (see admin.css): --series-1 (blue, views) and
// --series-2 (orange, link clicks). Both were run through the palette validator.
const SERIES = [
  { key: 'views', label: 'Views', color: 'var(--series-1)' },
  { key: 'clicks', label: 'Link clicks', color: 'var(--series-2)' },
];

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const parseDay = (d) => new Date(`${d}T00:00:00Z`);
const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact' });
const axisNumber = (n) => (n >= 10000 ? compactFmt.format(n) : formatNumber(n));

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Round the top of the axis to a clean number and pick ~4 even steps. Counts are whole numbers. */
export function niceScale(maxValue) {
  const rough = Math.max(maxValue, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow);
  const max = Math.ceil(maxValue / step) * step || step;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

// ---------------------------------------------------------------------------------------------

export function RangePicker({ value, onChange }) {
  return (
    <Segmented
      label="Date range"
      value={value}
      onChange={onChange}
      options={[
        { value: 7, label: 'Last 7 days' },
        { value: 30, label: 'Last 30 days' },
        { value: 90, label: 'Last 90 days' },
      ]}
    />
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

/** Daily views + link clicks on ONE shared axis (never two y-scales). */
export function TrendChart({ daily, title = 'Traffic' }) {
  const wrap = useRef(null);
  const width = useWidth(wrap);
  const [hover, setHover] = useState(null);
  const [mode, setMode] = useState('chart');

  const n = daily.length;
  const H = 260;
  // Wide enough charts reserve a right-hand margin for series names, written beside each line's end
  // (nothing can cross them there). Narrow ones skip them: the legend and tooltip carry identity.
  const direct = width >= 560;
  const m = { top: 14, right: direct ? 92 : 28, bottom: 30, left: 46 };
  const innerW = Math.max(width - m.left - m.right, 10);
  const innerH = H - m.top - m.bottom;
  const peak = Math.max(0, ...daily.map((d) => Math.max(d.views, d.clicks)));
  const { max, ticks } = niceScale(peak);
  const x = (i) => m.left + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);
  const y = (v) => m.top + innerH - (v / max) * innerH;
  const empty = peak === 0;

  const path = (key) => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');

  // ~one x label every 70px, always ending on the last day
  const every = Math.max(1, Math.ceil(70 / (n > 1 ? innerW / (n - 1) : innerW)));
  const labelAt = (i) => (n - 1 - i) % every === 0;

  const last = daily[n - 1];
  const gap = last ? Math.abs(y(last.views) - y(last.clicks)) : 0;
  const showEndLabels = direct && !empty && gap >= 16; // two labels must not touch each other

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = n > 1 ? Math.round(((e.clientX - rect.left) / innerW) * (n - 1)) : 0;
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? n - 2) + 1));
    else if (e.key === 'Home') setHover(0);
    else if (e.key === 'End') setHover(n - 1);
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  const hovered = hover != null ? daily[hover] : null;
  const tipLeft = hovered ? Math.min(Math.max(x(hover), 96), Math.max(width - 96, 96)) : 0;
  const peakViews = daily.reduce((a, d) => (d.views > a.views ? d : a), daily[0] || { views: 0 });
  const summary = empty
    ? `${title}: no views or clicks in this period.`
    : `${title}: daily views and link clicks over ${n} days. Busiest day for views: ${shortDate.format(parseDay(peakViews.date))} with ${peakViews.views}. Use the arrow keys to read each day, or switch to the table view.`;

  return (
    <section className="card chart-card" aria-label={title}>
      <header className="chart-head">
        <h2>{title}</h2>
        <ul className="legend">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className="legend-key" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        <Segmented
          label="View as"
          value={mode}
          onChange={setMode}
          options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]}
        />
      </header>

      {mode === 'table' ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Views</th>
                <th className="num">Visitors</th>
                <th className="num">Link clicks</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{longDate.format(parseDay(d.date))}</td>
                  <td className="num">{formatNumber(d.views)}</td>
                  <td className="num">{formatNumber(d.visitors)}</td>
                  <td className="num">{formatNumber(d.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={wrap} style={{ height: H }}>
          {width > 0 && (
            <svg
              width={width}
              height={H}
              role="img"
              aria-label={summary}
              tabIndex={0}
              className="trend-svg"
              onKeyDown={onKey}
              onBlur={() => setHover(null)}
            >
              {/* gridlines + y labels: hairline, solid, recessive */}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-line' : 'grid-line'} />
                  <text x={m.left - 8} y={y(t) + 4} textAnchor="end" className="axis-text">{axisNumber(t)}</text>
                </g>
              ))}
              {daily.map((d, i) =>
                labelAt(i) ? (
                  <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="axis-text">
                    {shortDate.format(parseDay(d.date))}
                  </text>
                ) : null,
              )}

              {/* views first, clicks on top */}
              {SERIES.map((s) => (
                <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ))}

              {/* end markers (>=8px with a 2px surface ring) and, when they don't collide, a direct label */}
              {n > 0 &&
                SERIES.map((s) => (
                  <g key={s.key}>
                    <circle cx={x(n - 1)} cy={y(last[s.key])} r="5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                    {showEndLabels && (
                      <text x={x(n - 1) + 12} y={y(last[s.key]) + 4} textAnchor="start" className="direct-label">{s.label}</text>
                    )}
                  </g>
                ))}

              {empty && (
                <text x={m.left + innerW / 2} y={m.top + innerH / 2 - 10} textAnchor="middle" className="empty-text">
                  No visits recorded in this period yet
                </text>
              )}

              {/* crosshair + hovered markers */}
              {hovered && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} className="crosshair" />
                  {SERIES.map((s) => (
                    <circle key={s.key} cx={x(hover)} cy={y(hovered[s.key])} r="5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                  ))}
                </g>
              )}

              {/* the whole plot is the hit target: the pointer only has to be near a day */}
              <rect
                x={m.left}
                y={m.top}
                width={innerW}
                height={innerH}
                fill="transparent"
                onPointerMove={pick}
                onPointerDown={pick}
                onPointerLeave={() => setHover(null)}
              />
            </svg>
          )}

          {hovered && (
            <div className="tooltip" style={{ left: tipLeft, top: 4 }} role="status">
              <div className="tooltip-date">{longDate.format(parseDay(hovered.date))}</div>
              {SERIES.map((s) => (
                <div className="tooltip-row" key={s.key}>
                  <span className="legend-key" style={{ background: s.color }} aria-hidden="true" />
                  <strong>{formatNumber(hovered[s.key])}</strong>
                  <span>{s.label.toLowerCase()}</span>
                </div>
              ))}
              <div className="tooltip-row tooltip-sub">
                <span className="legend-key legend-key-none" aria-hidden="true" />
                <strong>{formatNumber(hovered.visitors)}</strong>
                <span>visitors</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

/** Tiny trend line for a table row: de-emphasis grey line, current period in the accent. */
export function Sparkline({ values, width = 96, height = 28 }) {
  const pad = 6;
  const n = values.length;
  const max = Math.max(1, ...values);
  const x = (i) => pad + (n > 1 ? (i * (width - 2 * pad)) / (n - 1) : (width - 2 * pad) / 2);
  const y = (v) => height - pad - (v / max) * (height - 2 * pad);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="spark" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/** One hue, ranked largest first, value printed at the tip of each bar. */
export function RankedBars({ rows, unit = 'views', emptyText = 'Nothing yet.' }) {
  if (!rows.length) return <p className="muted small">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="ranked">
      {rows.map((r) => (
        <li key={r.name} title={`${r.name}: ${formatNumber(r.value)} ${unit}`}>
          <span className="ranked-name">{r.name}</span>
          <span className="ranked-track" aria-hidden="true">
            <span className="ranked-bar" style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 2) : 0}%` }} />
          </span>
          <strong className="ranked-val">{formatNumber(r.value)}</strong>
        </li>
      ))}
    </ul>
  );
}
