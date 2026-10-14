import { useEffect, useState } from 'react';
import ComplaintForm from './components/ComplaintForm.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import Sidebar from './Sidebar.jsx';
import Login from './Login.jsx';
import HomePage from './HomePage.jsx';
import MyComplaintsPage from './MyComplaintsPage.jsx';
import { ProfilePage, TrackPage } from './Pages.jsx';
import { getAuth, clearAuth, loadMine, markSeen, findResolvedNotices } from './api.js';

export default function App() {
  const [user, setUser] = useState(getAuth); // { token, role, email, name, adminRole } or null
  const [page, setPage] = useState(() => (getAuth()?.role === 'admin' ? 'admin' : 'home'));
  const [mine, setMine] = useState(null); // my complaints, shared by Home and My complaints
  const [notices, setNotices] = useState([]); // "your complaint was resolved" messages

  const refreshMine = () => {
    if (!user || user.role !== 'student') return Promise.resolve();
    return loadMine(user.email)
      .then((list) => {
        setMine(list);
        const fresh = findResolvedNotices(user.email, list);
        if (fresh.length) setNotices((n) => [...fresh, ...n]);
      })
      .catch(() => setMine((m) => m || []));
  };

  // load after login, then re-check every minute
  useEffect(() => {
    if (!user || user.role !== 'student') return;
    refreshMine();
    const timer = setInterval(refreshMine, 60 * 1000);
    return () => clearInterval(timer);
  }, [user?.email]);

  // a new complaint appears in the list immediately
  const addMine = (c) => {
    markSeen(user.email, c.trackingId, 'New');
    setMine((m) => [c, ...(m || [])]);
  };

  if (!user) {
    return (
      <Login
        onLogin={(auth) => {
          setUser(auth);
          setMine(null);
          setNotices([]);
          setPage(auth.role === 'admin' ? 'admin' : 'home');
        }}
      />
    );
  }

  const isAdmin = user.role === 'admin';

  const handleLogout = () => {
    clearAuth();
    setMine(null);
    setNotices([]);
    setUser(null);
  };

  const renderPage = () => {
    if (isAdmin) return <AdminDashboard adminRole={user.adminRole} />;
    switch (page) {
      case 'profile': return <ProfilePage user={user} />;
      case 'submit':  return <ComplaintForm user={user} onSubmitted={addMine} />;
      case 'mine':    return <MyComplaintsPage list={mine} onRefresh={refreshMine} />;
      case 'track':   return <TrackPage />;
      default:        return <HomePage user={user} go={setPage} list={mine} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-900 text-white p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-4">
          <h1 className="text-xl font-bold">SafeCampus AI</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden sm:inline opacity-80">
              {user.email} · {isAdmin ? `Admin (${(user.adminRole || '').replace('_', ' ')})` : 'Student'}
            </span>
            <button onClick={handleLogout} className="px-3 py-1.5 rounded-lg border border-white/40 hover:bg-white/10">
              Log out
            </button>
          </div>
        </div>
      </nav>

      {notices.length > 0 && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-3 space-y-2">
          {notices.map((n) => (
            <div key={n.trackingId} className="max-w-6xl mx-auto flex items-center justify-between gap-3 text-green-800">
              <span>
                ✅ Good news! Your complaint <b>“{n.title}”</b> ({n.trackingId}) has been <b>resolved</b>.
              </span>
              <button
                onClick={() => setNotices((list) => list.filter((x) => x.trackingId !== n.trackingId))}
                className="px-3 py-1 rounded-lg border border-green-300 text-sm font-semibold hover:bg-green-100"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-[calc(100vh-64px)]">
        <Sidebar active={isAdmin ? 'admin' : page} onSelect={setPage} isAdmin={isAdmin} />
        <main className="flex-1 min-w-0 p-4 sm:p-6">{renderPage()}</main>
      </div>
    </div>
  );
}