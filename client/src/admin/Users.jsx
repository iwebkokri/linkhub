import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPen, FaPlus, FaTrash } from 'react-icons/fa6';
import { api } from '../api.js';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';
import { Chip, Modal, Switch } from './ui.jsx';

function UserModal({ initial, businesses, isSelf, onClose, onSaved }) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(initial?.role ?? 'member');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [businessIds, setBusinessIds] = useState(initial?.businessIds ?? []);
  const [resetTwoFactor, setResetTwoFactor] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleBusiness = (id, on) => setBusinessIds((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name, email, role, ...(role === 'member' ? { businessIds } : {}) };
      if (isNew) {
        await api.post('/api/users', { ...payload, password });
      } else {
        await api.put(`/api/users/${initial.id}`, {
          ...payload,
          isActive,
          ...(password ? { password } : {}),
          ...(resetTwoFactor ? { resetTwoFactor: true } : {}),
        });
      }
      onSaved(isNew ? 'Team member added' : 'Changes saved');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isNew ? 'Add team member' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button form="user-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add team member' : 'Save changes'}</button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="two-col tight">
          <label className="field">
            <span className="field-label">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus={isNew} />
          </label>
          <label className="field">
            <span className="field-label">Email (used to sign in)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span className="field-label">{isNew ? 'Password' : 'New password'}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required={isNew}
            placeholder={isNew ? 'At least 12 characters' : 'Leave blank to keep the current password'}
          />
          {(isNew || password) && (
            <span className="hint">
              At least 12 characters. {initial?.id === undefined || !isSelf ? 'They will be made to choose their own password the first time they sign in, and all their current sessions end.' : ''}
            </span>
          )}
        </label>

        <div className="two-col tight">
          <label className="field">
            <span className="field-label">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
              <option value="member">Team member — only their assigned businesses</option>
              <option value="admin">Administrator — everything</option>
            </select>
            {isSelf && <span className="hint">You can&rsquo;t change your own role.</span>}
          </label>
          {!isNew && (
            <div className="field">
              <span className="field-label">Account</span>
              <Switch checked={isActive} onChange={setIsActive} disabled={isSelf} label={isActive ? 'Active' : 'Disabled — cannot sign in'} />
            </div>
          )}
        </div>

        {!isNew && initial.twoFactorEnabled && (
          <div className="field">
            <span className="field-label">Two-factor authentication</span>
            <Switch checked={resetTwoFactor} onChange={setResetTwoFactor} label="Reset two-factor (they lost their phone) - they'll set it up again" />
          </div>
        )}

        {role === 'member' ? (
          <div className="field">
            <span className="field-label">Assigned businesses</span>
            {businesses.length === 0 ? (
              <p className="muted small">No businesses exist yet.</p>
            ) : (
              <ul className="check-list">
                {businesses.map((b) => (
                  <li key={b.id}>
                    <label>
                      <input type="checkbox" checked={businessIds.includes(b.id)} onChange={(e) => toggleBusiness(b.id, e.target.checked)} />
                      <span><strong>{b.name}</strong> <span className="muted small">/{b.slug}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <span className="hint">This person can only see and edit the ticked businesses.</span>
          </div>
        ) : (
          <p className="hint">Administrators can access every business, team member and setting.</p>
        )}
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | user

  const load = () =>
    Promise.all([api.get('/api/users'), api.get('/api/businesses')])
      .then(([u, b]) => {
        setUsers(u.users);
        setBusinesses(b.businesses);
      })
      .catch((e) => toast.error(e.message));

  useEffect(() => {
    document.title = 'Team - LinkHub';
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.name}?\n\nThey will no longer be able to sign in. Their business assignments are removed too.`)) return;
    try {
      await api.del(`/api/users/${u.id}`);
      toast.success('Team member removed');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Add people and choose which business pages each of them can manage.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <FaPlus aria-hidden="true" /> Add team member
        </button>
      </div>

      <div className="card">
        {users === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Assigned businesses</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-title">{u.name} {u.id === me.id && <Chip>You</Chip>}</div>
                      <div className="cell-sub">{u.email}</div>
                    </td>
                    <td>
                      {u.role === 'admin' ? 'Administrator' : 'Team member'}
                      <div className="cell-sub">{u.twoFactorEnabled ? '🔒 two-factor on' : 'two-factor off'}</div>
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <span className="muted">All businesses</span>
                      ) : u.businessIds.length === 0 ? (
                        <span className="muted">None yet</span>
                      ) : (
                        <div className="chips">
                          {u.businessIds.map((id) => (
                            <Link key={id} to={`/admin/businesses/${id}`} className="chip chip-link">{nameOf.get(id) || `#${id}`}</Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><Chip tone={u.isActive ? 'good' : 'neutral'}>{u.isActive ? 'Active' : 'Disabled'}</Chip></td>
                    <td className="actions">
                      <button className="icon-btn" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}><FaPen /></button>
                      <button className="icon-btn icon-danger" onClick={() => remove(u)} disabled={u.id === me.id} aria-label={`Remove ${u.name}`}><FaTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <UserModal
          initial={editing === 'new' ? null : editing}
          businesses={businesses}
          isSelf={editing !== 'new' && editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            toast.success(msg);
            load();
          }}
        />
      )}
    </>
  );
}
