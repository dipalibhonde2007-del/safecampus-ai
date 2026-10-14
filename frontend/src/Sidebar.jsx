const STUDENT_ITEMS = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'profile', icon: '👤', label: 'Profile' },
  { id: 'submit', icon: '📝', label: 'Submit complaint' },
  { id: 'mine', icon: '📋', label: 'My complaints' },
  { id: 'track', icon: '🔎', label: 'Track complaint' },
];

// Shown only when someone logs in through Admin Access
const ADMIN_ITEMS = [{ id: 'admin', icon: '🏗️', label: 'Admin dashboard' }];

export default function Sidebar({ active, onSelect, isAdmin }) {
  const items = isAdmin ? ADMIN_ITEMS : STUDENT_ITEMS;
  return (
    <aside className="w-16 sm:w-20 shrink-0 bg-[#0a1622] border-r border-[#17304a] py-6 flex flex-col items-center gap-3">
      {items.map((it) => (
        <button
          key={it.id}
          title={it.label}
          aria-label={it.label}
          aria-current={active === it.id ? 'page' : undefined}
          onClick={() => onSelect(it.id)}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl grid place-items-center text-2xl border transition-colors ${
            active === it.id ? 'bg-[#16324d] border-[#17304a]' : 'border-transparent hover:bg-[#0e1c2c]'
          }`}
        >
          {it.icon}
        </button>
      ))}
    </aside>
  );
}