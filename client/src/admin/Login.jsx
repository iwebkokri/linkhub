import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';

export default function Login() {
  const { user, loading, login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null); // set once the password was right and a code is needed
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in - LinkHub';
  }, []);

  if (!loading && user) return <Navigate to="/admin" replace />;

  const done = () => navigate(location.state?.from || '/admin', { replace: true });

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await login(email, password);
      if (d.twoFactorRequired) {
        setChallenge(d.challenge);
        setPassword(''); // don't keep it in memory longer than needed
      } else {
        done();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyTwoFactor(challenge, code);
      done();
    } catch (err) {
      setError(err.message);
      if (err.status === 401 && /expired|Too many|enter your password/i.test(err.message)) {
        setChallenge(null);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      {challenge ? (
        <form className="login-card" onSubmit={submitCode}>
          <div className="brand brand-lg">
            <span className="brand-mark" aria-hidden="true">L</span>
            <span>LinkHub</span>
          </div>
          <h1>Two-step verification</h1>
          <p className="muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <label className="field">
            <span className="field-label">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={20}
              placeholder="123 456"
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => {
              setChallenge(null);
              setCode('');
              setError('');
            }}
          >
            Back
          </button>
        </form>
      ) : (
        <form className="login-card" onSubmit={submitPassword}>
          <div className="brand brand-lg">
            <span className="brand-mark" aria-hidden="true">L</span>
            <span>LinkHub</span>
          </div>
          <h1>Sign in</h1>
          <p className="muted">Manage your businesses&rsquo; link pages.</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint login-note">Always check the address bar: this page should be on your own domain, over https.</p>
        </form>
      )}
    </div>
  );
}
