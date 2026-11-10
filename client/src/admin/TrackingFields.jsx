const FIELDS = [
  {
    key: 'ga4Id',
    label: 'Google Analytics 4 (gtag.js)',
    placeholder: 'G-XXXXXXXXXX',
    hint: 'Analytics → Admin → Data streams → your web stream → “Measurement ID”.',
  },
  {
    key: 'gtmId',
    label: 'Google Tag Manager',
    placeholder: 'GTM-XXXXXXX',
    hint: 'The container ID shown at the top of tagmanager.google.com. Use it to add any other tag (LinkedIn, Hotjar, Google Ads…).',
  },
  {
    key: 'metaPixelId',
    label: 'Meta (Facebook) Pixel',
    placeholder: '123456789012345',
    hint: 'Events Manager → Data sources → your Pixel → the numeric Pixel ID.',
  },
  {
    key: 'tiktokPixelId',
    label: 'TikTok Pixel',
    placeholder: 'C1A2B3D4E5F6G7H8',
    hint: 'TikTok Ads Manager → Events → Web events → your Pixel ID.',
  },
];

export default function TrackingFields({ values, onChange }) {
  return (
    <>
      {FIELDS.map((f) => (
        <label className="field" key={f.key}>
          <span className="field-label">{f.label}</span>
          <input
            value={values[f.key] ?? ''}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
            placeholder={f.placeholder}
            spellCheck={false}
            autoComplete="off"
            maxLength={40}
          />
          <span className="hint">{f.hint}</span>
        </label>
      ))}
    </>
  );
}
