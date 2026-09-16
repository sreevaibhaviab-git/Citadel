import type { ReactNode } from 'react';

export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pointer-events-auto panel ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-[7px]">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/55">{title}</span>
          {right}
        </div>
      )}
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

export function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'warn' | 'alert' | 'ok';
}) {
  const colour =
    tone === 'alert'
      ? 'text-[#e06a5c]'
      : tone === 'warn'
      ? 'text-[#e0b84c]'
      : tone === 'ok'
      ? 'text-[#4ec9b0]'
      : 'text-white/85';
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">{label}</span>
      <span className={`font-mono text-[11px] tabular-nums tracking-[0.06em] ${colour}`}>{value}</span>
    </div>
  );
}

export function Btn({
  children,
  active,
  onClick,
  wide,
  tone = 'default',
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
  wide?: boolean;
  tone?: 'default' | 'alert';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'cmd',
        wide ? 'w-full' : '',
        active ? 'cmd-active' : '',
        tone === 'alert' ? 'cmd-alert' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function Bar({ value, tone = 'default' }: { value: number; tone?: 'default' | 'warn' | 'alert' }) {
  const colour = tone === 'alert' ? '#c8453a' : tone === 'warn' ? '#d6b447' : '#5f8ea8';
  return (
    <div className="mt-[3px] h-[2px] w-full bg-white/10">
      <div
        className="h-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: colour }}
      />
    </div>
  );
}
