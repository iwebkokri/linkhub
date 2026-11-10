import { useState } from 'react';
import { FaArrowDown, FaArrowUp, FaPen, FaPlus, FaTrash } from 'react-icons/fa6';
import { api } from '../api.js';
import { PLATFORMS, PlatformIcon, platformOf } from '../platforms.jsx';
import { useToast } from './toast.jsx';
import { Chip, Modal, Segmented, Switch, formatNumber } from './ui.jsx';

const stripScheme = (url) => url.replace(/^(mailto:|tel:)/i, '');

function LinkFormModal({ initial, onSave, onClose }) {
  const isNew = !initial;
  const [platform, setPlatform] = useState(initial?.platform ?? 'website');
  const [title, setTitle] = useState(initial?.title ?? platformOf('website').label);
  const [titleTouched, setTitleTouched] = useState(!isNew);
  const [url, setUrl] = useState(initial ? stripScheme(initial.url) : '');
  const [display, setDisplay] = useState(initial?.display ?? 'button');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const p = platformOf(platform);

  const choosePlatform = (key) => {
    setPlatform(key);
    if (!titleTouched) setTitle(platformOf(key).label);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave({ platform, title, url, display, isActive });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isNew ? 'Add a link' : 'Edit link'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button form="link-form" className="btn btn-primary" disabled={busy || !title.trim() || !url.trim()}>
            {busy ? 'Saving…' : isNew ? 'Add link' : 'Save link'}
          </button>
        </>
      }
    >
      <form id="link-form" onSubmit={submit}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <div className="field">
          <span className="field-label">Platform</span>
          <div className="platform-grid">
            {PLATFORMS.map((pl) => (
              <button
                key={pl.key}
                type="button"
                className={`platform-chip ${platform === pl.key ? 'is-on' : ''}`}
                aria-pressed={platform === pl.key}
                onClick={() => choosePlatform(pl.key)}
              >
                <pl.Icon aria-hidden="true" />
                <span>{pl.label}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Title</span>
          <input
            value={title}
            onChange={(e) => {
              setTitleTouched(true);
              setTitle(e.target.value);
            }}
            maxLength={100}
            required
          />
          <span className="hint">The text on the button (or the tooltip when shown as an icon).</span>
        </label>

        <label className="field">
          <span className="field-label">{p.inputLabel || 'Link (URL)'}</span>
          <input
            type={p.inputType === 'email' ? 'email' : 'text'}
            inputMode={p.inputType === 'tel' ? 'tel' : undefined}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={p.placeholder}
            autoFocus={isNew}
            required
          />
          {p.hint && <span className="hint">{p.hint}</span>}
          {!['website', 'other', 'email', 'phone', 'whatsapp'].includes(platform) && (
            <span className="hint">Must be a {p.label} address. For any other website choose “Website” or “Other link”.</span>
          )}
        </label>

        <div className="field">
          <span className="field-label">Show as</span>
          <Segmented
            label="Show as"
            value={display}
            onChange={setDisplay}
            options={[{ value: 'button', label: 'Button' }, { value: 'icon', label: 'Icon only' }]}
          />
          <span className="hint">Buttons are the large rows; icons sit in a compact row under the description, ideal for social profiles.</span>
        </div>

        <Switch checked={isActive} onChange={setIsActive} label="Visible on the public page" />
      </form>
    </Modal>
  );
}

export default function LinksTab({ businessId, links, setLinks }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // null | 'new' | link

  const create = async (payload) => {
    const d = await api.post(`/api/businesses/${businessId}/links`, payload);
    setLinks((l) => [...l, d.link]);
    toast.success('Link added');
  };

  const update = async (id, payload) => {
    const d = await api.put(`/api/links/${id}`, payload);
    setLinks((l) => l.map((x) => (x.id === id ? d.link : x)));
  };

  const toggle = async (link, isActive) => {
    setLinks((l) => l.map((x) => (x.id === link.id ? { ...x, isActive } : x))); // optimistic
    try {
      await update(link.id, { isActive });
    } catch (err) {
      setLinks((l) => l.map((x) => (x.id === link.id ? link : x)));
      toast.error(err.message);
    }
  };

  const remove = async (link) => {
    if (!window.confirm(`Delete "${link.title}"?\n\nIts click history is deleted with it. To keep the numbers, hide the link instead.`)) return;
    try {
      await api.del(`/api/links/${link.id}`);
      setLinks((l) => l.filter((x) => x.id !== link.id));
      toast.success('Link deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const move = async (index, dir) => {
    const next = [...links];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const before = links;
    setLinks(next); // optimistic
    try {
      await api.put(`/api/businesses/${businessId}/links/order`, { ids: next.map((l) => l.id) });
    } catch (err) {
      setLinks(before);
      toast.error(err.message);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Links</h2>
          <p className="muted small">Anything you add here appears on the public page straight away.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <FaPlus aria-hidden="true" /> Add link
        </button>
      </div>

      {links.length === 0 ? (
        <div className="empty">
          <p>No links yet. Add your social pages, website, booking links and more.</p>
        </div>
      ) : (
        <ul className="link-list">
          {links.map((link, i) => (
            <li key={link.id} className={`link-row ${link.isActive ? '' : 'is-hidden'}`}>
              <span className="link-badge" style={{ color: platformOf(link.platform).color === '#fffc00' ? '#0b0b0b' : platformOf(link.platform).color }}>
                <PlatformIcon platform={link.platform} />
              </span>
              <div className="link-main">
                <div className="link-title">
                  {link.title}
                  {link.display === 'icon' && <Chip>Icon</Chip>}
                  {!link.isActive && <Chip>Hidden</Chip>}
                </div>
                <div className="link-url" title={link.url}>{link.url}</div>
              </div>
              <div className="link-clicks" title="Total clicks on this link, all time">
                <strong>{formatNumber(link.clicks)}</strong>
                <span>{link.clicks === 1 ? 'click' : 'clicks'}</span>
              </div>
              <Switch checked={link.isActive} onChange={(v) => toggle(link, v)} label={<span className="sr-only">Visible</span>} />
              <div className="link-actions">
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${link.title} up`}><FaArrowUp /></button>
                <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label={`Move ${link.title} down`}><FaArrowDown /></button>
                <button className="icon-btn" onClick={() => setEditing(link)} aria-label={`Edit ${link.title}`}><FaPen /></button>
                <button className="icon-btn icon-danger" onClick={() => remove(link)} aria-label={`Delete ${link.title}`}><FaTrash /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <LinkFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(payload) => (editing === 'new' ? create(payload) : update(editing.id, payload).then(() => toast.success('Link updated')))}
        />
      )}
    </div>
  );
}
