import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ChangePasswordForm, TwoFactorPanel } from './SecurityPanels.jsx';

/** Shown instead of the app until the account is safe to use: a password the owner chose, and (for admins) 2FA. */
export default function ForcedSetup() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const needs = user.setupRequired;

  return (
    <div className="login-wrap">
      <div className="login-card setup-card">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>LinkHub</span>
        </div>
        <h1>Secure your account</h1>
        <p className="muted">Hi {user.name.split(' ')[0]}, there {needs.length > 1 ? 'are two quick things' : 'is one quick thing'} to do before you continue.</p>

        {needs.includes('password') && (
          <section className="setup-step">
            <h2>{needs.length > 1 ? '1. ' : ''}Choose your own password</h2>
            <p className="muted small">The password you were given was set by someone else. Replace it with one only you know.</p>
            <ChangePasswordForm />
          </section>
        )}

        {needs.includes('2fa') && (
          <section className={`setup-step ${needs.includes('password') ? 'is-waiting' : ''}`}>
            <h2>{needs.length > 1 ? '2. ' : ''}Turn on two-factor authentication</h2>
            <p className="muted small">Required for administrators. It protects the account even if the password is stolen or phished.</p>
            {needs.includes('password') ? <p className="hint">Do step 1 first.</p> : <TwoFactorPanel />}
          </section>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={async () => {
            await logout();
            navigate('/admin/login');
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
