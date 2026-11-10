import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './toast.jsx';
import { Switch } from './ui.jsx';
import TrackingFields from './TrackingFields.jsx';

const norm = (t) => JSON.stringify({ ...t, ga4Id: t.ga4Id || null, gtmId: t.gtmId || null, metaPixelId: t.metaPixelId || null, tiktokPixelId: t.tiktokPixelId || null });

export default function Settings() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Tracking codes - LinkHub';
    api
      .get('/api/settings/tracking')
      .then((d) => {
        setSaved(d.tracking);
        setDraft(d.tracking);
      })
      .catch((e) => toast.error(e.message));
  }, [toast]);

  if (!draft) return <div className="boot" aria-busy="true" />;
  const dirty = norm(draft) !== norm(saved);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api.put('/api/settings/tracking', draft);
      setSaved(d.tracking);
      setDraft(d.tracking);
      toast.success('Tracking settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tracking codes</h1>
          <p className="muted">Company-wide analytics and advertising codes, loaded on <strong>every</strong> business page.</p>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <TrackingFields values={draft} onChange={(change) => setDraft((d) => ({ ...d, ...change }))} />

        <hr />
        <h3>Visitor consent</h3>
        <Switch
          checked={draft.requireConsent}
          onChange={(v) => setDraft((d) => ({ ...d, requireConsent: v }))}
          label="Ask visitors to accept cookies before these tools load"
        />
        <p className="hint">
          When on, Google / Meta / TikTok scripts stay off until the visitor clicks Accept. Recommended if you have visitors in the EU, UK or Quebec.
          LinkHub&rsquo;s own statistics never use cookies or IP addresses, so they are unaffected.
        </p>

        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>

      <div className="card">
        <h3>Good to know</h3>
        <ul className="plain-list">
          <li>A business can add its <em>own</em> codes under <strong>Business → Tracking codes</strong>. Both sets load on that page; the same ID is never loaded twice.</li>
          <li>Every link click is also sent to these tools: a <code>link_click</code> event to Google (with the link title, platform, URL and business) and <code>LinkClick</code> to Meta.</li>
          <li>For anything else (LinkedIn Insight, Hotjar, Google Ads…), add it inside Google Tag Manager. If a tag needs a domain this site doesn&rsquo;t already allow, list it in <code>CSP_EXTRA_SOURCES</code> in the server&rsquo;s <code>.env</code>.</li>
        </ul>
      </div>
    </>
  );
}
