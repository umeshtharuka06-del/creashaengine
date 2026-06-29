import Image from "next/image";

/**
 * Mega 99 brand mark — renders the OFFICIAL supplied logo asset, background
 * removed (public/brand/mega99-logo-transparent.png) so it blends naturally onto
 * any surface with no square box behind it. The logo itself is never recreated
 * or restyled; we only size it, preserving its 1:1 aspect ratio (no stretch/crop).
 */
export function BrandLogo({
  size = 36,
  priority = false,
  className = "",
}: {
  size?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/brand/mega99-logo-transparent.png"
      alt="Mega 99"
      width={size}
      height={size}
      priority={priority}
      className={`select-none ${className}`}
      style={{ height: size, width: size, objectFit: "contain" }}
    />
  );
}
