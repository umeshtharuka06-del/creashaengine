import { BrandLogo } from "./BrandLogo";

/** Brand lockup (logo + wordmark). Kept under the old name for existing imports. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandLogo size={44} priority />
      <span className="font-display text-xl font-extrabold tracking-tight">
        MEGA <span className="brand-gradient">99</span>
      </span>
    </span>
  );
}
