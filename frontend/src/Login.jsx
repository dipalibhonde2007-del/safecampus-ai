import { useState } from 'react';
import { sendCode, verifyCode, setAuth } from './api.js';

const input = 'w-full h-12 px-4 rounded-xl border border-gray-300 focus:outline-none focus:border-blue-600';
const btn = 'h-12 px-6 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800 disabled:opacity-60';

export default function Login({ onLogin }) {
  const [role, setRole] = useState('student');
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [needName, setNeedName] = useState(false);
  const [code, setCode] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchRole = (r) => {
    setRole(r);
    setStep(1);
    setNeedName(false);
    setError('');
    setInfo('');
  };

  const send = async () => {
    setError('');
    setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (needName && !name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      const res = await sendCode(email.trim(), name.trim(), role);
      if (res.needName) {
        setNeedName(true);
        setInfo('First time here? Enter your name, then tap Send code again.');
      } else {
        setStep(2);
        setInfo(res.message || 'Code sent. Check your Inbox and Spam folder.');
      }
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const verify = async () => {
    setError('');
    if (!code.trim()) return setError('Enter the 6-digit code from your email.');
    setBusy(true);
    try {
      const res = await verifyCode(email.trim(), code.trim(), role);
      const auth = {
        token: res.token,
        role: res.role,
        adminRole: res.adminRole || null,
        email: email.trim().toLowerCase(),
        name: res.student?.name || 'Admin',
      };
      setAuth(auth);
      onLogin(auth);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 grid place-items-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="text-4xl">🛡️</div>
          <h1 className="text-2xl font-extrabold mt-2">SafeCampus AI</h1>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-gray-200">
          {[['student', 'Student Portal'], ['admin', 'Admin Access']].map(([r, label]) => (
            <button key={r} onClick={() => switchRole(r)}
              className={`py-2.5 rounded-xl font-semibold ${role === r ? 'bg-white shadow' : 'text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-xl font-bold">{role === 'student' ? 'Student Grievance Portal' : 'Admin Access'}</h2>
          <p className="text-gray-600 mt-1 mb-5">Login with your email. We will send you a code. No password needed.</p>

          {step === 1 ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="em">Email</label>
                <input id="em" type="email" className={input} placeholder="you@college.edu"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()} />
              </div>
              {needName && (
                <div>
                  <label className="block text-sm font-semibold mb-1" htmlFor="nm">Your name</label>
                  <input id="nm" className={input} placeholder="Full name" value={name}
                    onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
                </div>
              )}
              <button className={btn + ' w-full'} onClick={send} disabled={busy}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-semibold" htmlFor="cd">6-digit code sent to {email}</label>
              <div className="flex gap-2">
                <input id="cd" className={input} inputMode="numeric" maxLength={6} placeholder="123456"
                  value={code} onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verify()} />
                <button className={btn} onClick={verify} disabled={busy}>{busy ? '…' : 'Verify'}</button>
              </div>
              <button className="text-sm text-blue-700" onClick={() => { setStep(1); setCode(''); setError(''); }}>
                Use a different email
              </button>
            </div>
          )}

          {info && <p className="mt-3 text-sm text-blue-700">{info}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}