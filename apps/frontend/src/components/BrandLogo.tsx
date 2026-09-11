import type { ImgHTMLAttributes } from "react";
import { useTheme } from "@/stores/theme";

/** Full "Infinit Email" lockup (icon + wordmark). Swaps asset by theme since the artwork isn't recolorable like the old inline SVG. */
export function BrandLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/logo-dark.png" : "/logo-light.png";
  return <img src={src} alt="Infinit Email" {...props} />;
}

/** Icon-only mark (no wordmark) for slots too small for the full lockup, e.g. an install-prompt card. */
export function BrandMark(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/icon-512.png" alt="Infinit Email" {...props} />;
}
