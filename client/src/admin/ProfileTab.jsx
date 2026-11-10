import { ImageField, Switch } from './ui.jsx';

export default function ProfileTab({ draft, patch, business, isAdmin, imageBusy, onUpload, onRemoveImage, onDelete }) {
  return (
    <div className="card">
      <h2>Profile</h2>

      <label className="field">
        <span className="field-label">Business name</span>
        <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={100} />
      </label>

      <label className="field">
        <span className="field-label">Tagline</span>
        <input value={draft.tagline} onChange={(e) => patch({ tagline: e.target.value })} maxLength={160} placeholder="A short line under your name" />
        <span className="hint">{draft.tagline.length}/160</span>
      </label>

      <label className="field">
        <span className="field-label">Description</span>
        <textarea value={draft.bio} onChange={(e) => patch({ bio: e.target.value })} maxLength={1000} rows={4} placeholder="Tell visitors who you are and what you offer" />
        <span className="hint">{draft.bio.length}/1000</span>
      </label>

      <div className="image-fields">
        <ImageField
          label="Logo"
          hint="Square works best. PNG, JPG, WebP or GIF, up to 5 MB."
          url={business.logoUrl}
          round
          busy={imageBusy}
          onUpload={(f) => onUpload('logo', f)}
          onRemove={() => onRemoveImage('logo')}
        />
        <ImageField
          label="Cover image (optional)"
          hint="A wide banner shown above the logo."
          url={business.coverUrl}
          busy={imageBusy}
          onUpload={(f) => onUpload('cover', f)}
          onRemove={() => onRemoveImage('cover')}
        />
      </div>
      <p className="hint">Images are saved as soon as you upload them.</p>

      {isAdmin ? (
        <>
          <hr />
          <h3>Publishing</h3>
          <label className="field">
            <span className="field-label">Page address</span>
            <div className="input-prefix">
              <span>{window.location.host}/</span>
              <input
                value={draft.slug}
                onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                maxLength={50}
              />
            </div>
            <span className="hint">Changing this breaks links you've already shared.</span>
          </label>
          <Switch checked={draft.isActive} onChange={(v) => patch({ isActive: v })} label={draft.isActive ? 'Published — visible to everyone' : 'Hidden — visitors see "page not found"'} />

          <hr />
          <h3>Danger zone</h3>
          <p className="muted small">Deleting a business removes its page, links, team assignments and statistics.</p>
          <button className="btn btn-danger" onClick={onDelete}>Delete this business</button>
        </>
      ) : (
        <p className="hint">The page address is <strong>/{business.slug}</strong>. Only an administrator can change it or unpublish the page.</p>
      )}
    </div>
  );
}
