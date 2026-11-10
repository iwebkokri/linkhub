import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Directory from './pages/Directory.jsx';
import NotFound from './pages/NotFound.jsx';
import PublicPage from './pages/PublicPage.jsx';

// The admin panel is only downloaded by people who open /admin; public visitors never pay for it.
const AdminRoot = lazy(() => import('./admin/AdminRoot.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="center-screen" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Directory />} />
          <Route path="/admin/*" element={<AdminRoot />} />
          <Route path="/:slug" element={<PublicPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
