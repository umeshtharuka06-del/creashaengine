/**
 * Mega 99 icon system — one consistent line-icon style (24×24, currentColor,
 * 1.8 stroke). Replaces all emoji glyphs across the app. Import what you need:
 *   import { GameIcon, RocketIcon, WalletIcon } from "@/components/icons";
 */
type P = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function MegaphoneIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M18 9a3 3 0 0 1 0 6" />
    </svg>
  );
}

/* ── Game-mode marks (cohesive, distinct) ── */
export function ColorIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <circle cx="9" cy="9" r="5" />
      <circle cx="15" cy="15" r="5" />
    </svg>
  );
}
export function ParityIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function SapreIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function BconeIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3 21 20H3L12 3Z" />
      <path d="M7.5 12h9" />
    </svg>
  );
}
export function EmerdIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M6 3h12l3 5-9 13L3 8l3-5Z" />
      <path d="M3 8h18M9 3l-3 5 6 13 6-13-3-5" />
    </svg>
  );
}
export function RocketIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M12.5 4.5C16 2 21 3 21 3s1 5-1.5 8.5L14 17l-3-3 1.5-9.5Z" />
      <circle cx="15" cy="9" r="1.4" />
    </svg>
  );
}

/* Generic game tile mark (used for the home cards via a colored wrapper). */
export function GameIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Account / wallet / nav ── */
export function WalletIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 7V6a2 2 0 0 1 2-2h11M16 13h3" />
    </svg>
  );
}
export function RechargeIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M12 2v8m0 0 3-3m-3 3L9 7" />
    </svg>
  );
}
export function WithdrawIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 22v-8m0 0 3 3m-3-3-3 3" />
    </svg>
  );
}
export function HistoryIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </svg>
  );
}
export function ReferralIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17" cy="6" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <path d="M8.2 11 14.8 7M8.2 13l6.6 4" />
    </svg>
  );
}
export function ProfileIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
export function SettingsIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V21a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2H8a1 1 0 0 0 .6-.9V3a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1V8a1 1 0 0 0 .9.6H21a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}
export function AdminIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </svg>
  );
}
export function TrophyIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M6 4h12v3a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3" />
      <path d="M9 20h6M12 13v7" />
    </svg>
  );
}
export function LogoutIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17 5 12l5-5M5 12h12" />
    </svg>
  );
}
export function ShieldIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" />
    </svg>
  );
}
export function BoltIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}
export function EyeIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export function EyeOffIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.1 6.1A16 16 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.4-.6" />
    </svg>
  );
}

export function ChartIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  );
}

/** Mode → icon map for convenience. */
export const MODE_ICON = {
  COLOR: ColorIcon,
  PARITY: ParityIcon,
  SAPRE: SapreIcon,
  BCONE: BconeIcon,
  EMERD: EmerdIcon,
  CRASH: RocketIcon,
} as const;
