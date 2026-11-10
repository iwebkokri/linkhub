import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaArrowUpRightFromSquare } from 'react-icons/fa6';
import { api } from '../api.js';
import ProfileView from '../components/ProfileView.jsx';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';
import { Chip } from './ui.jsx';
import LinksTab from './LinksTab.jsx';
import ProfileTab from './ProfileTab.jsx';
import AppearanceTab from './AppearanceTab.jsx';
import AnalyticsTab from './AnalyticsTab.jsx';
import TrackingTab from './TrackingTab.jsx';
import TeamTab from './TeamTab.jsx';

const toDraft = (b) => ({
  name: b.name,
  slug: b.slug,
  tagline: b.tagline,
  bio: b.bio,
  theme: b.theme,
  isActive: b.isActive,
  tracking: b.tracking,
});

// '' and null both mean "not set" for tracking ids
const normalize = (d) => ({
  ...d,
  tracking: d.tracking && Object.fromEntries(Object.entries(d.tracking).map(([k, v]) => [k, v || null])),
});

export default function BusinessEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';

  const [data, setData] = useState(null); // { business, links, memberIds? }
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('links');
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api
      .get(`/api/businesses/${id}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setDraft(toDraft(d.business));
        document.title = `${d.business.name} - LinkHub`;
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dirty = useMemo(
    () => !!data && !!draft && JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(toDraft(data.business))),
    [data, draft],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error) {
    return (
      <div className="card">
        <p>{error}</p>
        <Link to="/admin" className="btn">Back to businesses</Link>
      </div>
    );
  }
  if (!data || !draft) return <div className="boot" aria-busy="true" />;

  const { business, links } = data;
  const setLinks = (update) => setData((p) => ({ ...p, links: typeof update === 'function' ? update(p.links) : update }));
  const setMemberIds = (memberIds) => setData((p) => ({ ...p, memberIds }));
  const patchDraft = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = isAdmin ? draft : { name: draft.name, tagline: draft.tagline, bio: draft.bio, theme: draft.theme };
      const d = await api.put(`/api/businesses/${id}`, payload);
      const merged = { ...business, ...d.business };
      setData((p) => ({ ...p, business: merged }));
      setDraft(toDraft(merged));
      toast.success('Changes saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (kind, file) => {
    if (file.size > 5 * 1024 * 1024) return toast.error('That image is larger than 5 MB.');
    setImageBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const d = await api.post(`/api/businesses/${id}/images/${kind}`, fd);
      setData((p) => ({ ...p, business: { ...p.business, ...d.business } }));
      toast.success('Image updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = async (kind) => {
    setImageBusy(true);
    try {
      const d = await api.del(`/api/businesses/${id}/images/${kind}`);
      setData((p) => ({ ...p, business: { ...p.business, ...d.business } }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const deleteBusiness = async () => {
    if (!window.confirm(`Delete "${business.name}" permanently?\n\nIts links, team assignments and all traffic statistics will be removed. This cannot be undone.`)) return;
    try {
      await api.del(`/api/businesses/${id}`);
      toast.success('Business deleted');
      window.location.assign('/admin');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const tabs = [
    { key: 'links', label: 'Links', badge: links.length },
    { key: 'profile', label: 'Profile' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'analytics', label: 'Analytics' },
    ...(isAdmin ? [{ key: 'tracking', label: 'Tracking codes' }, { key: 'team', label: 'Team', badge: data.memberIds?.length }] : []),
  ];

  const preview = { ...business, ...draft };

  return (
    <>
      <Link to="/admin" className="back-link">← All businesses</Link>
      <div className="page-head">
        <div>
          <h1>{business.name}</h1>
          <p className="muted">
            /{business.slug}{' '}
            <Chip tone={business.isActive ? 'good' : 'neutral'}>{business.isActive ? 'Live' : 'Hidden'}</Chip>
          </p>
        </div>
        <a className="btn" href={`/${business.slug}`} target="_blank" rel="noopener noreferrer">
          View public page <FaArrowUpRightFromSquare aria-hidden="true" />
        </a>
      </div>

      <div className="editor">
        <div className="editor-main">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={tab === t.key ? 'is-on' : ''}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.badge != null && <span className="tab-badge">{t.badge}</span>}
              </button>
            ))}
          </div>

          {tab === 'links' && <LinksTab businessId={business.id} links={links} setLinks={setLinks} />}
          {tab === 'profile' && (
            <ProfileTab
              draft={draft}
              patch={patchDraft}
              business={business}
              isAdmin={isAdmin}
              imageBusy={imageBusy}
              onUpload={uploadImage}
              onRemoveImage={removeImage}
              onDelete={deleteBusiness}
            />
          )}
          {tab === 'appearance' && <AppearanceTab draft={draft} patch={patchDraft} />}
          {tab === 'analytics' && <AnalyticsTab businessId={business.id} />}
          {tab === 'tracking' && isAdmin && <TrackingTab draft={draft} patch={patchDraft} />}
          {tab === 'team' && isAdmin && <TeamTab businessId={business.id} memberIds={data.memberIds || []} setMemberIds={setMemberIds} />}
        </div>

        <aside className="editor-preview" aria-label="Live preview">
          <div className="preview-label">Live preview</div>
          <div className="phone">
            <div className="phone-screen">
              <ProfileView business={preview} links={links.filter((l) => l.isActive)} embedded />
            </div>
          </div>
          <p className="muted small">Updates as you type. Visitors see exactly this.</p>
        </aside>
      </div>

      {dirty && (
        <div className="savebar" role="region" aria-label="Unsaved changes">
          <span>You have unsaved changes</span>
          <div className="row-gap">
            <button className="btn" onClick={() => setDraft(toDraft(business))} disabled={saving}>Discard</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}
    </>
  );
}
