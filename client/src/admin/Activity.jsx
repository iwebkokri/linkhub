import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './toast.jsx';
import { Chip, Segmented } from './ui.jsx';

const LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.2fa_failed': 'Wrong two-factor code',
  'auth.password_changed': 'Changed own password',
  'auth.2fa_enabled': 'Turned on two-factor',
  'auth.2fa_disabled': 'Turned off two-factor',
  'auth.sessions_revoked': 'Signed devices out',
  'user.created': 'Added a team member',
  'user.updated': 'Edited a team member',
  'user.deleted': 'Removed a team member',
  'user.password_reset': 'Reset a password',
  'user.2fa_reset': 'Reset two-factor',
  'business.created': 'Created a business',
  'business.updated': 'Edited a business',
  'business.deleted': 'Deleted a business',
  'business.tracking_changed': 'Changed tracking codes',
  'business.members_changed': 'Changed team assignment',
  'business.image_changed': 'Changed an image',
  'business.image_removed': 'Removed an image',
  'link.created': 'Added a link',
  'link.updated': 'Edited a link',
  'link.deleted': 'Deleted a link',
  'settings.tracking_changed': 'Changed company-wide tracking',
  'settings.location_changed': 'Changed visitor location detail',
};
const ALERTS = new Set(['auth.login_failed', 'auth.2fa_failed', 'user.password_reset', 'user.2fa_reset', 'auth.2fa_disabled', 'business.deleted', 'user.deleted']);

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'user', label: 'Team' },
  { value: 'business', label: 'Businesses' },
  { value: 'link', label: 'Links' },
  { value: 'settings', label: 'Settings' },
];

export default function Activity() {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [entries, setEntries] = useState(null);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (before) => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ limit: '50' });
        if (category) q.set('category', category);
        if (before) q.set('before', before);
        const d = await api.get(`/api/audit?${q}`);
        setEntries((prev) => (before ? [...(prev || []), ...d.entries] : d.entries));
        setNext(d.nextBefore);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    [category, toast],
  );

  useEffect(() => {
    document.title = 'Activity - LinkHub';
    load(null);
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="muted">Who signed in and who changed what. Use it to spot anything unexpected, such as failed sign-ins or a link you didn&rsquo;t add.</p>
        </div>
      </div>

      <div className="filter-row">
        <Segmented label="Show" value={category} onChange={setCategory} options={FILTERS} />
      </div>

      <div className={`card ${loading ? 'is-refetching' : ''}`}>
        {entries === null ? (
          <p className="muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <div className="table-scroll tall">
            <table className="data-table">
              <thead>
                <tr><th>When</th><th>Who</th><th>What</th><th>Details</th><th>From</th></tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{new Date(e.time).toLocaleString()}</td>
                    <td>{e.userEmail || <span className="muted">—</span>}</td>
                    <td>
                      <Chip tone={ALERTS.has(e.action) ? 'warn' : 'neutral'}>{LABELS[e.action] || e.action}</Chip>
                      {e.target && <div className="cell-sub">{e.target}</div>}
                    </td>
                    <td><div className="cell-detail" title={e.detail || ''}>{e.detail || ''}</div></td>
                    <td className="nowrap muted small">{e.ip || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next && (
          <div className="form-actions">
            <button className="btn" onClick={() => load(next)} disabled={loading}>Load older activity</button>
          </div>
        )}
      </div>
    </>
  );
}
