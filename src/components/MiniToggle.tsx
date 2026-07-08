export function MiniToggle({
  label,
  active,
  danger,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'h-5 w-5 rounded border text-[10px] font-semibold leading-none transition-colors',
        danger
          ? active
            ? 'border-record bg-record text-surface-0'
            : 'border-hairline text-ink-faint hover:text-record'
          : active
            ? 'border-meter-amber bg-meter-amber/20 text-meter-amber'
            : 'border-hairline text-ink-faint hover:text-ink',
      ].join(' ')}
    >
      {label[0]}
    </button>
  );
}
