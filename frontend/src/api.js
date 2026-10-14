const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const KEY = 'sc_auth';

/* ---------- login session ---------- */
export const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
};
export const setAuth = (a) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {}
};
export const clearAuth = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {}
};

/* ---------- one helper for every request ---------- */
async function request(path, { method = 'GET', body, form, blob, headers: extra } = {}) {
  const headers = { ...(extra || {}) };
  const auth = getAuth();
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

  let payload;
  if (form) {
    payload = form; // browser sets the multipart header itself
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload });
  } catch {
    throw new Error(`Cannot reach the server at ${BASE}. Is the backend running?`);
  }

  if (blob) {
    if (!res.ok) throw new Error('Could not load the file.');
    return res.blob();
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    // login expired: go back to the login page
    if (res.status === 401 && auth) {
      clearAuth();
      window.location.reload();
    }
    throw new Error(data?.message || 'Something went wrong. Try again.');
  }
  return data;
}

/* ---------- auth ---------- */
export const sendCode = (email, name, as) =>
  request('/api/auth/send-code', { method: 'POST', body: { email, name, as } });

export const verifyCode = (email, code, as) =>
  request('/api/auth/verify', { method: 'POST', body: { email, code, as } });

/* ---------- student ---------- */
export const submitComplaint = (form) => request('/api/complaints', { method: 'POST', form });
export const myComplaints = () => request('/api/my-complaints');
export const trackComplaint = (id) => request(`/api/track/${encodeURIComponent(id.trim())}`);

/* ---------- admin ---------- */
export const adminComplaints = () => request('/api/complaints');
export const updateStatus = (id, status) =>
  request(`/api/complaints/${id}/status`, { method: 'PATCH', body: { status } });
export const getPhoto = (id) => request(`/api/attachments/${id}`, { blob: true });

/* ---------- extra profile details (saved on this device only) ---------- */
const extraKey = (email) => `sc_extra_${email}`;

export function getExtras(email) {
  const base = {
    prn: '', department: '', year: 'FE', residence: 'Day scholar', hostel: '',
    mobile: '', contactName: '', contactPhone: '', anonymous: true,
  };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(extraKey(email))) || {}) };
  } catch {
    return base;
  }
}

export function saveExtras(email, extras) {
  try {
    localStorage.setItem(extraKey(email), JSON.stringify(extras));
  } catch {}
}

export const isProfileComplete = (e) => Boolean(e.prn && e.department && e.mobile);

/* ---------- remember my own complaints on this device (works for anonymous ones too) ---------- */
const idsKey = (email) => `sc_my_ids_${email}`;

export function rememberComplaint(email, trackingId) {
  try {
    const ids = JSON.parse(localStorage.getItem(idsKey(email))) || [];
    if (!ids.includes(trackingId)) ids.unshift(trackingId);
    localStorage.setItem(idsKey(email), JSON.stringify(ids));
  } catch {}
}

function rememberedIds(email) {
  try {
    return JSON.parse(localStorage.getItem(idsKey(email))) || [];
  } catch {
    return [];
  }
}

// Server list (non-anonymous) + complaints remembered on this device (anonymous ones)
export async function loadMine(email) {
  const local = rememberedIds(email);
  let server = [];
  try {
    server = await myComplaints();
  } catch (e) {
    if (local.length === 0) throw e;
  }

  const have = new Set(server.map((c) => c.trackingId));
  const extra = [];
  for (const id of local) {
    if (have.has(id)) continue;
    try {
      const t = await trackComplaint(id);
      extra.push({
        trackingId: t.trackingId,
        title: t.title,
        category: t.category,
        status: t.status,
        createdAt: t.submittedAt,
        anonymous: true,
        chatLastFrom: t.chatLastFrom,
        chatLastAt: t.chatLastAt,
      });
    } catch {}
  }

  return [...server, ...extra].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* ---------- in-app notifications: tell the student when a complaint becomes Resolved ---------- */
const seenKey = (email) => `sc_seen_${email}`;

function readSeen(email) {
  try {
    return JSON.parse(localStorage.getItem(seenKey(email))) || {};
  } catch {
    return {};
  }
}

function writeSeen(email, seen) {
  try {
    localStorage.setItem(seenKey(email), JSON.stringify(seen));
  } catch {}
}

export function markSeen(email, trackingId, status) {
  const seen = readSeen(email);
  seen[trackingId] = status;
  writeSeen(email, seen);
}

// Returns the complaints that just became Resolved since we last looked.
export function findResolvedNotices(email, list) {
  const seen = readSeen(email);
  const next = { ...seen };
  const notices = [];
  for (const c of list) {
    const now = c.status === 'Pending' ? 'New' : c.status;
    const before = seen[c.trackingId];
    if (before && before !== 'Resolved' && now === 'Resolved') notices.push(c);
    next[c.trackingId] = now;
  }
  writeSeen(email, next);
  return notices;
}

/* ---------- live chat ---------- */
const chatKeyName = (id) => `sc_chatkey_${id}`;

export function rememberChatKey(trackingId, key) {
  try {
    if (key) localStorage.setItem(chatKeyName(trackingId), key);
  } catch {}
}

const getChatKey = (trackingId) => {
  try {
    return localStorage.getItem(chatKeyName(trackingId)) || '';
  } catch {
    return '';
  }
};

const keyHeader = (trackingId) => ({ 'x-chat-key': getChatKey(trackingId) });

export const studentChatLoad = (trackingId) =>
  request(`/api/chat/${encodeURIComponent(trackingId)}`, { headers: keyHeader(trackingId) });

export const studentChatSend = (trackingId, text) =>
  request(`/api/chat/${encodeURIComponent(trackingId)}`, {
    method: 'POST',
    body: { text },
    headers: keyHeader(trackingId),
  });

export const adminChatLoad = (id) => request(`/api/admin/chat/${id}`);
export const adminChatSend = (id, text) =>
  request(`/api/admin/chat/${id}`, { method: 'POST', body: { text } });

/* "new reply" badges (remembered on this device) */
const seenAt = (k) => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const setSeen = (k) => {
  try {
    localStorage.setItem(k, String(Date.now()));
  } catch {}
};

export const markChatSeen = (trackingId) => setSeen(`sc_chatseen_${trackingId}`);
export const hasNewReply = (c) =>
  c.chatLastFrom === 'admin' && new Date(c.chatLastAt).getTime() > seenAt(`sc_chatseen_${c.trackingId}`);

export const markAdminSeen = (id) => setSeen(`sc_adminseen_${id}`);
export const hasNewStudentMessage = (c) =>
  c.chatLastFrom === 'student' && new Date(c.chatLastAt).getTime() > seenAt(`sc_adminseen_${c._id}`);