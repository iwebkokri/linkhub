import { Segmented, Switch } from './ui.jsx';

const PRESETS = [
  { name: 'Classic', theme: { background: '#f4f1ea', background2: null, text: '#1c1c1c', button: '#1c1c1c', buttonText: '#ffffff' } },
  { name: 'Midnight', theme: { background: '#0f172a', background2: '#1e3a8a', text: '#ffffff', button: '#38bdf8', buttonText: '#0f172a' } },
  { name: 'Sunrise', theme: { background: '#fff4e0', background2: '#ffd9a0', text: '#3b1f00', button: '#7a3e00', buttonText: '#ffffff' } },
  { name: 'Forest', theme: { background: '#ecf4ec', background2: '#cfe5d0', text: '#14301a', button: '#1f6b3a', buttonText: '#ffffff' } },
  { name: 'Berry', theme: { background: '#fdf0f5', background2: '#f6c9dc', text: '#4a1230', button: '#b0215f', buttonText: '#ffffff' } },
  { name: 'Slate', theme: { background: '#f1f5f9', background2: null, text: '#0f172a', button: '#334155', buttonText: '#ffffff' } },
];

function ColorField({ label, value, onChange }) {
  return (
    <div className="color-field">
      <span className="field-label">{label}</span>
      <div className="color-input">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} />
        <input
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.length === 7 ? v.toLowerCase() : v);
          }}
          maxLength={7}
          aria-label={`${label} hex value`}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export default function AppearanceTab({ draft, patch }) {
  const t = draft.theme;
  const set = (change) => patch({ theme: { ...t, ...change } });
  const valid = (c) => /^#[0-9a-f]{6}$/i.test(c);

  return (
    <div className="card">
      <h2>Appearance</h2>

      <div className="field">
        <span className="field-label">Colour themes</span>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="preset" onClick={() => set(p.theme)} title={`Apply the ${p.name} theme`}>
              <span className="preset-swatch" style={{ background: `linear-gradient(160deg, ${p.theme.background}, ${p.theme.background2 || p.theme.background})` }}>
                <span style={{ background: p.theme.button }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="color-grid">
        <ColorField label="Background" value={t.background} onChange={(v) => set({ background: v })} />
        <ColorField label="Text" value={t.text} onChange={(v) => set({ text: v })} />
        <ColorField label="Button" value={t.button} onChange={(v) => set({ button: v })} />
        <ColorField label="Button text" value={t.buttonText} onChange={(v) => set({ buttonText: v })} />
      </div>

      <div className="field">
        <Switch
          checked={!!t.background2}
          onChange={(on) => set({ background2: on ? (valid(t.background) ? t.background : '#ffffff') : null })}
          label="Gradient background"
        />
        {t.background2 && (
          <div className="color-grid" style={{ marginTop: 12 }}>
            <ColorField label="Gradient end colour" value={t.background2} onChange={(v) => set({ background2: v })} />
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">Button shape</span>
        <Segmented
          label="Button shape"
          value={t.buttonStyle}
          onChange={(v) => set({ buttonStyle: v })}
          options={[{ value: 'rounded', label: 'Rounded' }, { value: 'pill', label: 'Pill' }, { value: 'square', label: 'Square' }]}
        />
      </div>

      <div className="field">
        <span className="field-label">Button style</span>
        <Segmented
          label="Button style"
          value={t.buttonVariant}
          onChange={(v) => set({ buttonVariant: v })}
          options={[{ value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }, { value: 'soft', label: 'Soft' }]}
        />
      </div>

      <div className="field">
        <span className="field-label">Font</span>
        <Segmented
          label="Font"
          value={t.font}
          onChange={(v) => set({ font: v })}
          options={[{ value: 'sans', label: 'Sans-serif' }, { value: 'serif', label: 'Serif' }, { value: 'rounded', label: 'Rounded' }]}
        />
      </div>

      <p className="hint">Tip: choose a button colour with strong contrast against the button text so links stay easy to read.</p>
    </div>
  );
}
