import { useEffect, useState } from 'react';
import ChatBox from '../ChatBox.jsx';
import {
  adminComplaints, updateStatus, getPhoto,
  adminChatLoad, adminChatSend, markAdminSeen, hasNewStudentMessage,
} from '../api.js';

const PRIORITY = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Normal: 'bg-green-100 text-green-700',
};
const STATUS = ['New', 'In Review', 'Resolved', 'Escalated'];

// Photos need the admin login, so they are loaded with fetch and shown from a temporary URL.
function Photo({ id, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let made;
    getPhoto(id)
      .then((blob) => {
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => {});
    return () => made && URL.revokeObjectURL(made);
  }, [id]);

  if (!url) return <div className="w-12 h-12 rounded border bg-gray-100" />;
  return (
    <button onClick={() => onOpen(url)} aria-label="View photo">
      <img src={url} alt="" className="w-12 h-12 object-cover rounded border" />
    </button>
  );
}

export default function AdminDashboard({ adminRole }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [chat, setChat] = useState(null); // complaint whose chat is open
  const [, setTick] = useState(0);

  const load = () => {
    setError('');
    adminComplaints().then(setRows).catch((e) => { setError(e.message); setRows([]); });
  };

  // load now, then refresh every 30 seconds so new complaints and new chat messages appear by themselves
  useEffect(() => {
    load();
    const timer = setInterval(load, 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const change = async (id, status) => {
    try {
      await updateStatus(id, status);
      setRows((rs) => rs.map((r) => (r._id === id ? { ...r, status } : r)));
    } catch (e) {
      setError(e.message);
    }
  };

  const openChat = (r) => {
    markAdminSeen(r._id);
    setChat(r);
  };

  const closeChat = () => {
    if (chat) markAdminSeen(chat._id);
    setChat(null);
    setTick((t) => t + 1);
    load();
  };

  const list = rows || [];
  const norm = (s) => (s === 'Pending' ? 'New' : s);
  const count = (s) => list.filter((r) => norm(r.status) === s).length;
  const stats = [
    { icon: '📋', n: list.length, l: 'Total complaints' },
    { icon: '🚨', n: list.filter((r) => r.priority === 'High' && r.status !== 'Resolved').length, l: 'High priority open' },
    { icon: '🆕', n: count('New'), l: 'New' },
    { icon: '✅', n: count('Resolved'), l: 'Resolved' },
  ];

  const q = search.trim().toLowerCase();
  const visible = list.filter((r) => {
    if (filter !== 'All' && norm(r.status) !== filter) return false;
    if (!q) return true;
    const haystack = [r.trackingId, r.title, r.description, r.category, r.studentName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">🏗️ Admin dashboard</h2>
          <p className="text-gray-600 mt-1">
            High priority complaints are shown first. Your role: <b>{(adminRole || '').replace('_', ' ')}</b>
          </p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-xl border border-gray-300 font-semibold hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.l} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="text-2xl">{s.icon}</div>
            <div className="text-3xl font-extrabold mt-1">{rows ? s.n : '–'}</div>
            <div className="text-gray-600 text-sm">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by complaint ID (e.g. CMP-FYTVRL), title, category or description"
            aria-label="Search complaints"
            className="w-full h-12 pl-11 pr-24 rounded-xl border border-gray-300 focus:outline-none focus:border-blue-600"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg bg-gray-100 text-sm font-semibold hover:bg-gray-200"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {['All', ...STATUS].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${
                filter === f ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-700'
              }`}>
              {f}
            </button>
          ))}
          {rows && (
            <span className="ml-auto text-sm text-gray-500">
              Showing {visible.length} of {list.length}
            </span>
          )}
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        {rows === null && <p className="text-gray-500 py-6 text-center">Loading…</p>}
        {rows && visible.length === 0 && !error && (
          <p className="text-gray-500 py-6 text-center">
            {q ? `No complaints match “${search.trim()}”.` : 'No complaints here yet.'}
          </p>
        )}

        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-2 pr-3">ID</th>
                  <th className="pr-3">Student</th>
                  <th className="pr-3">Complaint</th>
                  <th className="pr-3">Category</th>
                  <th className="pr-3">Photos</th>
                  <th className="pr-3">Priority</th>
                  <th className="pr-3">Status</th>
                  <th>Chat</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r._id} className="border-t align-top">
                    <td className="py-3 pr-3 font-semibold whitespace-nowrap">{r.trackingId || '-'}</td>
                    <td className="pr-3">{r.studentName}</td>
                    <td className="pr-3 max-w-xs">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-gray-600">{r.description}</div>
                      {r.reason && <div className="text-xs text-gray-400 mt-1">{r.reason}</div>}
                    </td>
                    <td className="pr-3">{r.category}</td>
                    <td className="pr-3">
                      <div className="flex gap-1">
                        {(r.attachments || []).map((a) => <Photo key={a} id={a} onOpen={setPreview} />)}
                        {(!r.attachments || r.attachments.length === 0) && <span className="text-gray-400">None</span>}
                      </div>
                    </td>
                    <td className="pr-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${PRIORITY[r.priority] || ''}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td className="pr-3">
                      <select value={norm(r.status)}
                        onChange={(e) => change(r._id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1">
                        {STATUS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => openChat(r)}
                        className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-800 font-semibold hover:bg-blue-50">
                        💬 Chat
                      </button>
                      {hasNewStudentMessage(r) && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">New</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/70 grid place-items-center p-4 z-50" onClick={() => setPreview(null)}>
          <img src={preview} alt="Complaint photo" className="max-h-[85vh] max-w-full rounded-xl" />
        </div>
      )}

      {chat && (
        <ChatBox
          me="admin"
          title={chat.title}
          subtitle={`${chat.trackingId || ''} · ${chat.studentName}`}
          load={() => adminChatLoad(chat._id)}
          send={(text) => adminChatSend(chat._id, text)}
          onClose={closeChat}
        />
      )}
    </div>
  );
}