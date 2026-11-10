import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';
import { Chip, copyText } from './ui.jsx';

// ---------------------------------------------------------------------------------------------
export function ChangePasswordForm({ onDone }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.put('/api/auth/password', { currentPassword, newPassword });
      toast.success('Password changed. Other devices were signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      await refresh();
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <label className="field">
        <span className="field-label">Current password</span>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="field">
        <span className="field-label">New password</span>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={72} required />
        <span className="hint">At least 12 characters. A long passphrase, or a random one from a password manager, is best.</span>
      </label>
      <label className="field">
        <span className="field-label">Repeat new password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={12} maxLength={72} required />
      </label>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
function RecoveryCodes({ codes, onDone }) {
  const toast = useToast();
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`LinkHub recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkhub-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="alert alert-warn" role="status">
        <strong>Save these recovery codes now.</strong> They are shown only once. If you lose your phone, each code lets you sign in one time.
      </div>
      <ul className="recovery-codes">
        {codes.map((c) => <li key={c}><code>{c}</code></li>)}
      </ul>
      <div className="row-gap">
        <button type="button" className="btn btn-sm" onClick={() => copyText(text).then(() => toast.success('Copied')).catch(() => toast.error('Copy failed - select the codes manually'))}>Copy</button>
        <button type="button" className="btn btn-sm" onClick={download}>Download</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>I&rsquo;ve saved them</button>
      </div>
    </div>
  );
}

export function TwoFactorPanel() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('idle'); // idle | password | scan | codes | disable
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState(null); // { secret, uri, qr }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [left, setLeft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.twoFactorEnabled) api.get('/api/auth/me').then((d) => setLeft(d.recoveryCodesLeft ?? null)).catch(() => {});
  }, [user.twoFactorEnabled, step]);

  const reset = () => {
    setStep('idle');
    setPassword('');
    setCode('');
    setSetup(null);
    setError('');
  };

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'codes' && codes) {
    return (
      <RecoveryCodes
        codes={codes}
        onDone={async () => {
          setCodes(null);
          reset();
          await refresh();
          toast.success('Two-factor authentication is on');
        }}
      />
    );
  }

  if (step === 'password') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            setSetup(await api.post('/api/auth/2fa/setup', { password }));
            setPassword('');
            setStep('scan');
          });
        }}
      >
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <label className="field">
          <span className="field-label">Confirm your password to continue</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
        </label>
        <div className="row-gap">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          <button type="button" className="btn" onClick={reset}>Cancel</button>
        </div>
      </form>
    );
  }

  if (step === 'scan' && setup) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const d = await api.post('/api/auth/2fa/enable', { code });
            setCodes(d.recoveryCodes);
            setStep('codes');
          });
        }}
      >
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <ol className="steps">
          <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li>
          <li>
            Scan this QR code with the app:
            <div className="qr"><img src={setup.qr} alt="QR code to add LinkHub to your authenticator app" width="220" height="220" /></div>
            <details>
              <summary>Can&rsquo;t scan? Enter this key by hand</summary>
              <code className="secret-key">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
            </details>
          </li>
          <li>Type the 6-digit code the app shows:</li>
        </ol>
        <label className="field">
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123 456" autoFocus required aria-label="6-digit code" />
        </label>
        <div className="row-gap">
          <button className="btn btn-primary" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Turn on'}</button>
          <button type="button" className="btn" onClick={reset}>Cancel</button>
        </div>
      </form>
    );
  }

  if (step === 'disable') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api.post('/api/auth/2fa/disable', { password, code });
            await refresh();
            toast.success('Two-factor authentication is off');
            reset();
          });
        }}
      >
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span className="field-label">Current code (or a recovery code)</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={20} required />
        </label>
        <div className="row-gap">
          <button className="btn btn-danger" disabled={busy}>{busy ? 'Checking…' : 'Turn off'}</button>
          <button type="button" className="btn" onClick={reset}>Cancel</button>
        </div>
      </form>
    );
  }

  return user.twoFactorEnabled ? (
    <div>
      <p><Chip tone="good">On</Chip> Signing in needs your password <em>and</em> a code from your authenticator app.</p>
      {left !== null && <p className="muted small">{left} unused recovery {left === 1 ? 'code' : 'codes'} left.{left <= 2 && ' Consider turning two-factor off and on again to get a fresh set.'}</p>}
      <button className="btn" onClick={() => setStep('disable')}>Turn off…</button>
    </div>
  ) : (
    <div>
      <p><Chip>Off</Chip> Add a second step to protect your account if your password is ever stolen or phished.</p>
      <button className="btn btn-primary" onClick={() => setStep('password')}>Set up two-factor authentication</button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function describeDevice(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown device';
  return `${browser} on ${os}`;
}

export function SessionsPanel() {
  const toast = useToast();
  const [sessions, setSessions] = useState(null);

  const load = () => api.get('/api/auth/sessions').then((d) => setSessions(d.sessions)).catch(() => setSessions([]));
  useEffect(() => {
    load();
  }, []);

  const signOutOthers = async () => {
    try {
      await api.del('/api/auth/sessions/others');
      toast.success('Signed out of your other devices');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!sessions) return <p className="muted">Loading…</p>;
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div>
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <div>
              <strong>{describeDevice(s.userAgent)}</strong> {s.current && <Chip tone="good">This device</Chip>}
              <div className="muted small">{s.ip || 'unknown address'} · last active {new Date(s.lastSeen).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={signOutOthers} disabled={!others}>Sign out all other devices</button>
    </div>
  );
}
