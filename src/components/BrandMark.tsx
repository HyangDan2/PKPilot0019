import type { JSX } from 'react';

/**
 * The official HD2Lab dual-skew mark (Web-HQ geometry, same as the favicon set
 * and the OG card). One source of truth: `tools/generate_brand_assets.py`
 * prints these two path strings, so the header never drifts from the icons.
 */
const FRAME_BACK =
  'M13.000 18.714L37.000 6.714L37.000 43.986L13.000 55.986ZM17.000 21.186L33.000 13.186L33.000 41.514L17.000 49.514Z';
const FRAME_FRONT =
  'M27.000 22.814L51.000 10.814L51.000 48.086L27.000 60.086ZM31.000 25.286L47.000 17.286L47.000 45.614L31.000 53.614Z';

export function BrandMark({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className="brand-glyph"
    >
      <path fill="currentColor" fillRule="evenodd" d={FRAME_BACK} />
      <path fill="currentColor" fillRule="evenodd" d={FRAME_FRONT} />
    </svg>
  );
}
