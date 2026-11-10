import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from './toast.jsx';
import { Chip } from './ui.jsx';

export default function TeamTab({ businessId, memberIds, setMemberIds }) {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/users').then((d) => setUsers(d.users)).catch((e) => toast.error(e.message));
  }, [toast]);

  const toggle = async (userId, on) => {
    const next = on ? [...memberIds, userId] : memberIds.filter((x) => x !== userId);
    setBusy(true);
    try {
      const d = await api.put(`/api/businesses/${businessId}/members`, { userIds: next });
      setMemberIds(d.userIds);
      toast.success(on ? 'Team member assigned' : 'Team member removed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const members = (users || []).filter((u) => u.role === 'member');
  const admins = (users || []).filter((u) => u.role === 'admin' && u.isActive);

  return (
    <div className="card">
      <h2>Team</h2>
      <p className="muted">
        Assigned team members can sign in and edit this business&rsquo;s profile, links and look, and see its analytics. They can&rsquo;t see
        other businesses.
      </p>

      {users === null ? (
        <p className="muted">Loading…</p>
      ) : members.length === 0 ? (
        <div className="empty">
          <p>You haven&rsquo;t added any team members yet.</p>
          <Link className="btn" to="/admin/users">Add a team member</Link>
        </div>
      ) : (
        <ul className="check-list">
          {members.map((u) => (
            <li key={u.id}>
              <label>
                <input type="checkbox" checked={memberIds.includes(u.id)} disabled={busy} onChange={(e) => toggle(u.id, e.target.checked)} />
                <span>
                  <strong>{u.name}</strong>
                  <span className="muted small"> {u.email}</span>
                </span>
                {!u.isActive && <Chip>Disabled</Chip>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {admins.length > 0 && (
        <p className="hint">Administrators ({admins.map((a) => a.name).join(', ')}) always have access to every business.</p>
      )}
    </div>
  );
}
