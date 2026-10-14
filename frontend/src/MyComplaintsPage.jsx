import { useState } from 'react';
import ChatBox from './ChatBox.jsx';
import { studentChatLoad, studentChatSend, markChatSeen, hasNewReply } from './api.js';

const card = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-6';

const badge = (status) =>
  status === 'Resolved' ? 'bg-green-100 text-green-700'
    : status === 'In Review' ? 'bg-blue-100 text-blue-700'
    : status === 'Escalated' ? 'bg-red-100 text-red-700'
    : 'bg-yellow-100 text-yellow-700';

export default function MyComplaintsPage({ list, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState(null); // complaint whose chat is open

  const refresh = async () => {
    setBusy(true);
    await onRefresh();
    setBusy(false);
  };

  const openChat = (c) => {
    markChatSeen(c.trackingId);
    setChat(c);
  };

  const closeChat = () => {
    if (chat) markChatSeen(chat.trackingId);
    setChat(null);
    onRefresh();
  };

  return (
    <div className={card + ' max-w-3xl mx-auto'}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-2xl font-bold">📋 My complaints</h2>
        <button onClick={refresh} disabled={busy}
          className="px-4 py-2 rounded-xl border border-gray-300 font-semibold hover:bg-gray-50 disabled:opacity-60">
          {busy ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Complaints you submitted from this device are shown here, including anonymous ones. Nobody else can see which are yours.
      </p>

      {list === null && <p className="text-gray-500 py-6 text-center">Loading…</p>}
      {list && list.length === 0 && <p className="text-gray-500 py-6 text-center">No complaints yet.</p>}

      {list && list.map((c) => (
        <div key={c.trackingId} className="py-3 border-t first:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold truncate">
                {c.title}
                {c.anonymous && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Anonymous</span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {c.trackingId} · {c.category} · {new Date(c.createdAt).toLocaleDateString()}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${badge(c.status)}`}>
              {c.status === 'Pending' ? 'New' : c.status}
            </span>
          </div>

          <div className="mt-2">
            <button
              onClick={() => openChat(c)}
              className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-800 text-sm font-semibold hover:bg-blue-50">
              💬 Chat with admin
            </button>
            {hasNewReply(c) && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">New reply</span>
            )}
          </div>
        </div>
      ))}

      {chat && (
        <ChatBox
          me="student"
          title={chat.title}
          subtitle={`${chat.trackingId} · Chat with the admin team`}
          load={() => studentChatLoad(chat.trackingId)}
          send={(text) => studentChatSend(chat.trackingId, text)}
          onClose={closeChat}
        />
      )}
    </div>
  );
}