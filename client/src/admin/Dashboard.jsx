import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaArrowUpRightFromSquare, FaCopy, FaPlus } from 'react-icons/fa6';
import { api } from '../api.js';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';
import { Chip, Modal, copyText, formatNumber } from './ui.jsx';
import { RangePicker, StatTile, TrendChart } from './charts.jsx';
import { LocationSection } from './locations.jsx';

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

function CreateBusinessModal({ onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownSlug = touched ? slug : slugify(name);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api.post('/api/businesses', { name, slug: shownSlug || undefined });
      toast.success('Business created');
      navigate(`/admin/businesses/${d.business.id}`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New business"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button form="new-business" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create business'}
          </button>
        </>
      }
    >
      <form id="new-business" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Business name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus required />
        </label>
        <label className="field">
          <span className="field-label">Page address</span>
          <div className="input-prefix">
            <span>{window.location.host}/</span>
            <input
              value={shownSlug}
              onChange={(e) => {
                setTouched(true);
                setSlug(slugify(e.target.value));
              }}
              maxLength={50}
              placeholder="my-business"
            />
          </div>
          <span className="hint">Lowercase letters, numbers and dashes. You can change it later.</span>
        </label>
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [businesses, setBusinesses] = useState(null);
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get('/api/businesses').then((d) => setBusinesses(d.businesses)).catch((e) => toast.error(e.message));
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/api/analytics/overview?days=${days}`)
      .then((d) => !cancelled && setOverview(d))
      .catch((e) => !cancelled && toast.error(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, toast]);

  const perBusiness = useMemo(() => new Map((overview?.businesses || []).map((b) => [b.id, b])), [overview]);
  const totals = overview?.totals;

  const copyLink = async (slug) => {
    const url = `${window.location.origin}/${slug}`;
    try {
      await copyText(url);
      toast.success('Link copied');
    } catch {
      toast.error(`Copy this link manually: ${url}`);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Businesses' : 'Your businesses'}</h1>
          <p className="muted">
            {isAdmin ? 'Every business page, with its traffic and link clicks.' : 'The business pages you have been assigned to.'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <FaPlus aria-hidden="true" /> New business
          </button>
        )}
      </div>

      {/* one filter row above everything it scopes */}
      <div className="filter-row">
        <RangePicker value={days} onChange={setDays} />
        {overview && <span className="muted small">Days run midnight to midnight, {overview.timezone}.</span>}
      </div>

      <div className={loading ? 'is-refetching' : ''}>
        <div className="stats">
          <StatTile label="Page views" value={formatNumber(totals?.views)} />
          <StatTile label="Visitors" value={formatNumber(totals?.visitors)} hint="Counted once per day" />
          <StatTile label="Link clicks" value={formatNumber(totals?.clicks)} />
          <StatTile label="Click rate" value={totals && totals.views ? `${Math.round((totals.clicks / totals.views) * 1000) / 10}%` : '–'} hint="Clicks per view" />
        </div>
        {overview && <TrendChart daily={overview.daily} title="Traffic across your businesses" />}
        {overview && <LocationSection locations={overview.locations} isAdmin={isAdmin} compact title="Top countries" />}
      </div>

      <h2 className="section-title">{businesses ? `${businesses.length} ${businesses.length === 1 ? 'business' : 'businesses'}` : 'Businesses'}</h2>

      {businesses && businesses.length === 0 && (
        <div className="card empty">
          {isAdmin ? (
            <p>No businesses yet. Create your first one to get started.</p>
          ) : (
            <p>You haven&rsquo;t been assigned to a business yet. Ask an administrator to add you to one.</p>
          )}
        </div>
      )}

      <div className="biz-grid">
        {(businesses || []).map((b) => {
          const stats = perBusiness.get(b.id);
          return (
            <article className="card biz-card" key={b.id}>
              <div className="biz-top">
                <span className="biz-logo" style={{ background: b.theme.button, color: b.theme.buttonText }}>
                  {b.logoUrl ? <img src={b.logoUrl} alt="" /> : b.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="biz-title">
                  <Link to={`/admin/businesses/${b.id}`}><strong>{b.name}</strong></Link>
                  <span className="muted small">/{b.slug}</span>
                </div>
                <Chip tone={b.isActive ? 'good' : 'neutral'}>{b.isActive ? 'Live' : 'Hidden'}</Chip>
              </div>

              <dl className="biz-stats">
                <div><dt>Views</dt><dd>{formatNumber(stats?.views)}</dd></div>
                <div><dt>Clicks</dt><dd>{formatNumber(stats?.clicks)}</dd></div>
                <div><dt>Links</dt><dd>{formatNumber(b.linkCount)}</dd></div>
                {isAdmin && <div><dt>Team</dt><dd>{formatNumber(b.memberCount)}</dd></div>}
              </dl>
              <p className="muted small biz-range">Views and clicks: last {days} days</p>

              <div className="biz-actions">
                <Link className="btn btn-primary btn-sm" to={`/admin/businesses/${b.id}`}>Manage</Link>
                <a className="btn btn-sm" href={`/${b.slug}`} target="_blank" rel="noopener noreferrer">
                  View page <FaArrowUpRightFromSquare aria-hidden="true" />
                </a>
                <button className="btn btn-sm btn-ghost" onClick={() => copyLink(b.slug)} aria-label={`Copy link for ${b.name}`}>
                  <FaCopy aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {creating && <CreateBusinessModal onClose={() => setCreating(false)} />}
    </>
  );
}
