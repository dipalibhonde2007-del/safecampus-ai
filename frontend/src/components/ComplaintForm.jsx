import { useState } from 'react';
import { submitComplaint, getExtras, rememberComplaint, rememberChatKey } from '../api.js';

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const input = 'w-full px-4 rounded-xl border border-gray-300 focus:outline-none focus:border-blue-600';

export default function ComplaintForm({ user, onSubmitted }) {
  const [anonymous, setAnonymous] = useState(() => getExtras(user.email).anonymous);
  const [notify, setNotify] = useState(true); // email me when resolved (anonymous complaints)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]); // [{ file, url }]
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setError('');
    if (photos.length + files.length > MAX_PHOTOS) return setError(`You can add up to ${MAX_PHOTOS} photos.`);
    for (const f of files) {
      if (!f.type.startsWith('image/')) return setError('Only image files are allowed.');
      if (f.size > MAX_BYTES) return setError(`"${f.name}" is larger than 5 MB.`);
    }
    setPhotos((p) => [...p, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const removePhoto = (i) => {
    URL.revokeObjectURL(photos[i].url);
    setPhotos((p) => p.filter((_, j) => j !== i));
  };

  const submit = async () => {
    if (!title.trim()) return setError('Enter an incident title.');
    if (description.trim().length < 10) return setError('Describe the incident in at least 10 characters.');
    setError('');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('anonymous', String(anonymous));
      form.append('notify', String(notify));
      photos.forEach((p) => form.append('photos', p.file));

      const res = await submitComplaint(form);
      rememberComplaint(user.email, res.trackingId);
      rememberChatKey(res.trackingId, res.chatKey); // chat साठी secret key device वर साठवा
      if (onSubmitted) {
        onSubmitted({
          trackingId: res.trackingId,
          title: res.complaint?.title || title.trim(),
          category: res.complaint?.category || 'General',
          status: res.complaint?.status || 'New',
          createdAt: res.complaint?.createdAt || new Date().toISOString(),
          anonymous,
        });
      }
      setDone({ trackingId: res.trackingId, anonymous, emailMe: !anonymous || notify });
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setTitle('');
      setDescription('');
      setPhotos([]);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(done.trackingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (done) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold mt-3">Complaint submitted</h2>
        <p className="text-gray-600 mt-2">
          Save this tracking ID. You can check the status with it anytime.
        </p>
        <div className="mt-4 inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-xl font-bold tracking-wide">{done.trackingId}</span>
          <button onClick={copy} className="text-sm font-semibold text-blue-700">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="text-sm text-gray-600 mt-4">
          {done.emailMe
            ? `📧 We will email ${user.email} when this complaint is resolved.`
            : '🔔 You will see a notification here when it is resolved.'}
        </p>
        <div className="mt-5">
          <button onClick={() => setDone(null)} className="px-5 py-2.5 rounded-xl bg-blue-900 text-white font-semibold">
            Submit another complaint
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Student Grievance Portal</h2>
        <p className="text-gray-600 mt-1">Submit your concerns confidentially for AI-driven priority evaluation.</p>
      </div>

      <label className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200 cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span className="text-sm">Submit anonymously (my name will not be saved or shown to anyone)</span>
      </label>

      {anonymous && (
        <label className="flex items-start gap-3 p-3 rounded-xl bg-green-50 border border-green-200 cursor-pointer">
          <input type="checkbox" className="mt-1 w-5 h-5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span className="text-sm">
            Email me at <b>{user.email}</b> when this is resolved.
            <span className="block text-xs text-gray-600 mt-1">
              Admins never see your email. It is kept privately and deleted right after the message is sent.
            </span>
          </span>
        </label>
      )}

      {!anonymous && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          📧 We will email <b>{user.email}</b> when this complaint is resolved.
        </p>
      )}

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="t">Incident Title *</label>
        <input id="t" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Ragging in hostel block B" className={input + ' h-11'} />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor="d">Detailed Description *</label>
        <textarea id="d" rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what happened, where and when." className={input + ' py-3'} />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Photos of the incident (optional)</label>
        <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={photos.length >= MAX_PHOTOS}
          className="block w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-gray-100 file:font-semibold" />
        <p className="text-xs text-gray-500 mt-1">
          Up to 3 photos, 5 MB each. Location and device details are removed automatically.
        </p>
        {photos.length > 0 && (
          <div className="flex gap-3 mt-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative">
                <img src={p.url} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border" />
                <button onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button onClick={submit} disabled={busy}
        className="px-6 py-3 rounded-xl bg-blue-900 text-white font-bold hover:bg-blue-800 disabled:opacity-60">
        {busy ? 'Submitting…' : 'Submit Complaint'}
      </button>
    </div>
  );
}