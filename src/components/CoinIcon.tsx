/**
 * Premium gold coin icon — used everywhere a balance / coin amount is shown,
 * replacing the old "◆" diamond glyph. Pure inline SVG (no extra deps), so it
 * stays crisp at any size and inherits the surrounding font size via `em`.
 */
type Props = { className?: string; size?: number };

export function CoinIcon({ className, size }: Props) {
  const dim = size ?? "1em";
  return (
    <svg
      className={className}
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "-0.125em" }}
    >
      <defs>
        <linearGradient id="coinG" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.5" stopColor="#f6b738" />
          <stop offset="1" stopColor="#d98a14" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#coinG)" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#b8740c" strokeWidth="1" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff3cf" strokeWidth="1" opacity="0.6" />
      <path
        d="M12 7.2c-1.9 0-3.2 1-3.2 2.4 0 1.3 1.1 1.9 2.9 2.3 1.3.3 1.7.6 1.7 1.1 0 .5-.5.9-1.4.9-1 0-1.6-.4-1.7-1.1H8.6c.1 1.4 1.1 2.3 2.6 2.5V18h1.4v-.8c1.7-.2 2.8-1.1 2.8-2.5 0-1.4-1.1-2-2.9-2.4-1.3-.3-1.7-.6-1.7-1.1 0-.5.5-.8 1.3-.8.9 0 1.4.4 1.5 1h1.6c-.1-1.3-1-2.2-2.4-2.4V6h-1.4v1.2z"
        fill="#fff7e0"
      />
    </svg>
  );
}
