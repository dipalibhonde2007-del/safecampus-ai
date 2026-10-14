import { getExtras, isProfileComplete } from './api.js';

const card = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-6';
const btn = 'px-5 py-2.5 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800';

export default function HomePage({ user, go, list }) {
  const extras = getExtras(user.email);

  const loaded = Array.isArray(list);
  const resolved = loaded ? list.filter((c) => c.status === 'Resolved').length : 0;
  const stats = [
    { icon: '📋', n: loaded ? list.length : '–', l: 'My Complaints' },
    { icon: '✅', n: loaded ? resolved : '–', l: 'Resolved' },
    { icon: '⏳', n: loaded ? list.length - resolved : '–', l: 'Pending' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className={card}>
        <h2 className="text-3xl font-extrabold">Welcome back, {user.name.split(' ')[0]} 👋</h2>
        <p className="mt-3 text-gray-600 leading-relaxed">
          SafeCampus AI is a secure platform to report ragging, harassment, bullying and other campus
          grievances. AI-assisted analysis helps authorities prioritize serious cases while protecting
          student privacy.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className={btn} onClick={() => go('submit')}>📝 Submit New Complaint</button>
          {!isProfileComplete(extras) && (
            <button className="px-5 py-2.5 rounded-xl border border-gray-300 font-semibold" onClick={() => go('profile')}>
              Complete your profile
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {stats.map((s) => (
          <button key={s.l} onClick={() => go('mine')} className={card + ' text-left hover:border-blue-400'}>
            <div className="text-3xl">{s.icon}</div>
            <div className="mt-2 text-3xl font-extrabold">{s.n}</div>
            <div className="text-gray-600">{s.l}</div>
          </button>
        ))}
      </div>
    </div>
  );
}