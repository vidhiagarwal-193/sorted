// The Sorted mark: an olive tile with a check whose short stroke "drops into place".
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#898C72" />
      <path d="M8.5 16.5l5 5L24 10" fill="none" stroke="#F7F5F0" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span className="font-display text-[22px] font-bold leading-none tracking-tight text-ink">
          Sorted<span className="text-accent-deep">.</span>
        </span>
      )}
    </span>
  );
}
