export function MessageRoleCircle({ label, role }: { label: string; role: 'assistant' | 'user' }) {
  return (
    <span aria-hidden="true" className={`message-role-circle ${role}`}>
      {role === 'assistant' ? 'AI' : label.slice(0, 1).toUpperCase()}
    </span>
  );
}
