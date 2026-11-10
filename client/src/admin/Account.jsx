import { useEffect } from 'react';
import { useAuth } from './auth.jsx';
import { ChangePasswordForm, SessionsPanel, TwoFactorPanel } from './SecurityPanels.jsx';

export default function Account() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = 'My account - LinkHub';
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My account</h1>
          <p className="muted">{user.name} · {user.email}</p>
        </div>
      </div>

      <div className="card narrow">
        <h2>Two-factor authentication</h2>
        <TwoFactorPanel />
      </div>

      <div className="card narrow">
        <h2>Change password</h2>
        <ChangePasswordForm />
      </div>

      <div className="card narrow">
        <h2>Where you&rsquo;re signed in</h2>
        <p className="muted small">Sessions end after 12 hours, or after 2 hours without activity. Don&rsquo;t recognise one? Sign out everywhere, then change your password.</p>
        <SessionsPanel />
      </div>
    </>
  );
}
