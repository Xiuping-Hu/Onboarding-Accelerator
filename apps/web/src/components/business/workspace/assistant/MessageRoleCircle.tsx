export function MessageRoleCircle({ label, role }: { label: string; role: 'assistant' | 'user' }) {
  return (
    <span
      aria-hidden="true"
      className={
        role === 'assistant'
          ? 'grid size-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-[9px] font-extrabold text-indigo-700'
          : 'order-2 grid size-7 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-extrabold text-slate-700'
      }
    >
      {role === 'assistant' ? 'AI' : label.slice(0, 1).toUpperCase()}
    </span>
  );
}
