import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FaChartSimple, FaClockRotateLeft, FaKey, FaRightFromBracket, FaStore, FaUsers } from 'react-icons/fa6';
import { useAuth } from './auth.jsx';
import ForcedSetup from './ForcedSetup.jsx';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    document.title = 'LinkHub admin';
  }, []);

  // A new password and/or two-factor must be set up before anything else is reachable.
  if (user.setupRequired?.length) return <ForcedSetup />;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>LinkHub</span>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/admin" end>
            <FaStore aria-hidden="true" /> Businesses
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin/users">
              <FaUsers aria-hidden="true" /> Team
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin/settings">
              <FaChartSimple aria-hidden="true" /> Tracking codes
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin/activity">
              <FaClockRotateLeft aria-hidden="true" /> Activity
            </NavLink>
          )}
          <NavLink to="/admin/account">
            <FaKey aria-hidden="true" /> My account
          </NavLink>
        </nav>
        <div className="side-foot">
          <div className="who">
            <strong>{user.name}</strong>
            <span>{isAdmin ? 'Administrator' : 'Team member'}</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              await logout();
              navigate('/admin/login');
            }}
          >
            <FaRightFromBracket aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
