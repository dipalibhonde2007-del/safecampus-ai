import { useState } from 'react';
import { trackComplaint, getExtras, saveExtras, isProfileComplete } from './api.js';

const card = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-6';
const input = 'w-full h-11 px-4 rounded-xl border border-gray-300 focus:outline-none focus:border-blue-600';
const btn = 'px-5 py-2.5 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800';

/* ---------------- PROFILE ---------------- */
function Field({ label, value, onChange, editing, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      {editing ? (
        <input type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className={input} />
      ) : (
        <div className="font-semibold min-h-[1.5rem]">
          {value || <span className="text-gray-400">Not added</span>}
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, editing, options }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      {editing ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <div className="font-semibold">{value}</div>
      )}
    </div>
  );
}

export function ProfilePage({ user }) {
  const [p, setP] = useState(() => getExtras(user.email));
  const [editing, setEditing] = useState(() => !isProfileComplete(getExtras(user.email)));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [sos, setSos] = useState('');

  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!p.prn.trim() || !p.department.trim() || !p.mobile.trim()) {
      return setError('Please fill PRN, Department and Mobile number.');
    }
    if (!/^\d{10}$/.test(p.mobile.trim())) return setError('Mobile number must be 10 digits.');
    setError('');
    saveExtras(user.email, p);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const sendSos = () => {
    if (!p.contactPhone) return setSos('Add an emergency contact first (tap Edit profile).');
    setSos(`Contact: ${p.contactName || 'Emergency contact'} – ${p.contactPhone}. Automatic alerts are not connected yet.`);
  };

  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className={card + ' flex items-center gap-4'}>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white grid place-items-center text-xl font-bold">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold truncate">{user.name}</h2>
          <p className="text-gray-500 truncate">{user.email} · Student</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-xl border border-gray-300 font-semibold hover:bg-gray-50">
            Edit profile
          </button>
        ) : (
          <button onClick={save} className={btn}>Save</button>
        )}
      </div>

      {!isProfileComplete(p) && (
        <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          Welcome! Add your college details below. They are saved only on this device and are never sent with an anonymous complaint.
        </div>
      )}
      {saved && <div className="p-3 rounded-xl bg-green-100 text-green-700 text-sm">Profile saved.</div>}
      {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className={card}>
        <h3 className="text-lg font-bold mb-4">🎓 College details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="PRN / Roll number" value={p.prn} onChange={set('prn')} editing={editing} placeholder="e.g. 72012345K" />
          <Field label="Department" value={p.department} onChange={set('department')} editing={editing} placeholder="e.g. Computer Engineering" />
          <SelectField label="Year" value={p.year} onChange={set('year')} editing={editing} options={['FE', 'SE', 'TE', 'BE']} />
          <SelectField label="Stay" value={p.residence} onChange={set('residence')} editing={editing} options={['Day scholar', 'Hostel']} />
          {p.residence === 'Hostel' && (
            <Field label="Hostel block and room" value={p.hostel} onChange={set('hostel')} editing={editing} placeholder="e.g. Block B, Room 214" />
          )}
          <Field label="Mobile number" value={p.mobile} onChange={set('mobile')} editing={editing} type="tel" placeholder="10-digit number" />
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-bold mb-4">🚨 Safety</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Emergency contact name" value={p.contactName} onChange={set('contactName')} editing={editing} placeholder="Parent or trusted person" />
          <Field label="Emergency contact number" value={p.contactPhone} onChange={set('contactPhone')} editing={editing} type="tel" placeholder="10-digit number" />
        </div>
        <button onClick={sendSos}
          className="mt-5 px-5 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">
          🚨 SOS – show my contact
        </button>
        {sos && <p className="mt-3 text-sm text-gray-700">{sos}</p>}
      </div>

      <div className={card}>
        <h3 className="text-lg font-bold mb-2">🔒 Privacy</h3>
        <label className={`flex items-start gap-3 ${editing ? 'cursor-pointer' : 'opacity-70'}`}>
          <input type="checkbox" className="mt-1 w-5 h-5" disabled={!editing} checked={p.anonymous}
            onChange={(e) => set('anonymous')(e.target.checked)} />
          <span>
            <span className="font-semibold">Submit my complaints anonymously by default</span>
            <span className="block text-sm text-gray-500">
              Anonymous complaints are not linked to your account. Use the tracking ID to check the status.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

/* ---------------- TRACK ---------------- */
export function TrackPage() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setResult(null);
    if (!id.trim()) return setError('Enter a tracking ID first.');
    setBusy(true);
    try {
      setResult(await trackComplaint(id));
      setError('');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const steps = ['New', 'In Review', 'Resolved'];
  const reachedIndex = (s) => (s === 'Resolved' ? 2 : s === 'In Review' || s === 'Escalated' ? 1 : 0);

  return (
    <div className={card + ' max-w-xl mx-auto'}>
      <h2 className="text-2xl font-bold">🔎 Track with an ID</h2>
      <p className="text-gray-600 mt-2 mb-4">
        Enter a tracking ID to see its status. Use this for anonymous complaints.
      </p>
      <div className="flex gap-3">
        <input className={input} placeholder="e.g. CMP-7K3QX9" value={id}
          onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && check()} />
        <button className={btn} onClick={check} disabled={busy}>{busy ? '…' : 'Check'}</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-5 p-4 rounded-xl bg-gray-50 border border-gray-200">
          <div className="font-semibold">{result.trackingId} · {result.title}</div>
          <div className="text-sm text-gray-500">{result.category}</div>
          <div className="text-sm text-gray-500 mb-4">
            Submitted {new Date(result.submittedAt).toLocaleString()} · Updated {new Date(result.lastUpdated).toLocaleString()}
          </div>
          <ol className="space-y-3">
            {steps.map((s, i) => {
              const reached = reachedIndex(result.status) >= i;
              return (
                <li key={s} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-xs text-white ${reached ? 'bg-green-600' : 'bg-gray-300'}`}>
                    {reached ? '✓' : ''}
                  </span>
                  <span className={reached ? 'font-semibold' : 'text-gray-400'}>
                    {s === 'New' ? 'Submitted' : s}
                  </span>
                </li>
              );
            })}
          </ol>
          {result.status === 'Escalated' && (
            <p className="mt-3 text-sm text-red-700">This complaint has been escalated to senior authorities.</p>
          )}
        </div>
      )}
    </div>
  );
}