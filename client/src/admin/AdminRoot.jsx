import { Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAdmin, RequireAuth } from './auth.jsx';
import { ToastProvider } from './toast.jsx';
import AdminLayout from './AdminLayout.jsx';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import BusinessEditor from './BusinessEditor.jsx';
import Users from './Users.jsx';
import Settings from './Settings.jsx';
import Activity from './Activity.jsx';
import Account from './Account.jsx';
import './admin.css';

export default function AdminRoot() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="businesses/:id" element={<BusinessEditor />} />
              <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
              <Route path="settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
              <Route path="activity" element={<RequireAdmin><Activity /></RequireAdmin>} />
              <Route path="account" element={<Account />} />
              <Route path="*" element={<div className="card"><p>That page doesn&rsquo;t exist.</p></div>} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
