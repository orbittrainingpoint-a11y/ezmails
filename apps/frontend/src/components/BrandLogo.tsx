import type { SVGProps } from "react";

/**
 * Infinit Email brand mark — an infinity loop (figure-eight) with an envelope
 * flap at the centre. Drawn with `currentColor` so it inherits text colour and
 * sits inside the gradient logo chips used across the app.
 */
export function BrandLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* infinity */}
      <path d="M12 12C12 9.5 6 9.5 6 12C6 14.5 12 14.5 12 12C12 9.5 18 9.5 18 12C18 14.5 12 14.5 12 12Z" />
      {/* envelope flap */}
      <path d="M9.6 11.2 12 13.5 14.4 11.2" />
    </svg>
  );
}
