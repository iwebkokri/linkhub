import { Link } from 'react-router-dom';
import TrackingFields from './TrackingFields.jsx';

export default function TrackingTab({ draft, patch }) {
  const tracking = draft.tracking || {};
  return (
    <div className="card">
      <h2>Tracking codes</h2>
      <p className="muted">
        Add this business&rsquo;s own analytics and advertising codes. They load <strong>only on this business&rsquo;s page</strong>, in
        addition to any company-wide codes set under <Link to="/admin/settings">Tracking codes</Link>. Each link click is also sent to these tools
        as a <code>link_click</code> event (Google) or <code>LinkClick</code> (Meta).
      </p>
      <TrackingFields values={tracking} onChange={(change) => patch({ tracking: { ...tracking, ...change } })} />
      <p className="hint">
        Leave a field empty to turn it off. Remember to save. This is separate from LinkHub&rsquo;s built-in statistics, which are always recorded.
      </p>
    </div>
  );
}
