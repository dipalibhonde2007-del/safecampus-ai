import { useEffect, useRef, useState } from 'react';

// Shared chat window for students and admins. `me` is 'student' or 'admin'.
export default function ChatBox({ title, subtitle, me, load, send, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const lastCount = useRef(0);

  const refresh = async () => {
    try {
      const res = await load();
      setMessages(res.messages || []);
      setError('');

    } catch (e) {
      setError(e.message);
    }
    setLoaded(true);
  };

  // "live": check for new messages every 4 seconds while the chat is open
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await send(t);
      setMessages(res.messages || []);
      setText('');
      setError('');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const otherName = me === 'student' ? 'Admin team' : 'Student';

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center p-3 z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-[80vh] rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b">
          <div className="min-w-0">
            <div className="font-bold truncate">💬 {title}</div>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close chat"
            className="px-3 py-1 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {!loaded && <p className="text-center text-gray-500 py-6">Loading…</p>}
          {loaded && messages.length === 0 && !error && (
            <p className="text-center text-gray-500 py-6">
              No messages yet. {me === 'student' ? 'Write to the admin team below.' : 'Write to the student below.'}
            </p>
          )}
          {messages.map((m, i) => {
            const mine = m.from === me;
            return (
              <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                  mine ? 'bg-blue-900 text-white rounded-br-sm' : 'bg-white border border-gray-200 rounded-bl-sm'
                }`}>
                  {!mine && <div className="text-xs font-semibold text-blue-700 mb-0.5">{otherName}</div>}
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className={`text-[10px] mt-1 ${mine ? 'text-blue-200' : 'text-gray-400'}`}>
                    {new Date(m.at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}
        <div className="p-3 border-t flex gap-2 items-end">
          <textarea
            rows={2}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type a message… (Enter to send)"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:border-blue-600 resize-none"
          />
          <button onClick={submit} disabled={busy || !text.trim()}
            className="h-11 px-5 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800 disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}