import { useEffect, useRef } from 'react';
import { FaImage, FaXmark } from 'react-icons/fa6';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <FaXmark />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={`switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'is-on' : ''}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ tone = 'neutral', children }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function ImageField({ label, hint, url, round, onUpload, onRemove, busy }) {
  const input = useRef(null);
  return (
    <div className="image-field">
      <div className={`image-preview ${round ? 'is-round' : ''}`}>
        {url ? <img src={url} alt="" /> : <FaImage aria-hidden="true" />}
      </div>
      <div>
        <div className="field-label">{label}</div>
        <p className="hint">{hint}</p>
        <div className="row-gap">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
          </button>
          {url && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
      </div>
    </div>
  );
}

export function formatNumber(n) {
  return new Intl.NumberFormat().format(n ?? 0);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard not available'));
}
