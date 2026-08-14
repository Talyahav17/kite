// Kite logo (P-038) — the CEO's artwork, geometry preserved as supplied.
// The string leaves the sail, loops below, and runs up into the K.
//
// Changes from the supplied source, all mechanical rather than design:
//   • showCard defaults to false — the presentation card belongs on a brand
//     sheet, not in the app chrome.
//   • Sized by HEIGHT with the width derived, and the viewBox cropped to the
//     artwork. Sizing by width overflowed the header bar, because the loop
//     makes the drawing nearly square.
//   • Gradient ids are per-instance; they were global, so the reversed copy on
//     the sign-in panel would repaint the header one.
//   • A reverse palette for dark backgrounds.
const PALETTES = {
  brand: {
    from: "#9B00E8",
    mid: "#7500C0",
    to: "#550099",
    faceFrom: "#B833FF",
    faceTo: "#8000D4",
    spar: "#FFFFFF",
    sparOpacity: 0.85,
  },
  reverse: {
    from: "#FFFFFF",
    mid: "#F3E6FF",
    to: "#DCC0F7",
    faceFrom: "#FFFFFF",
    faceTo: "#E6D2FB",
    spar: "#7500C0",
    sparOpacity: 0.5,
  },
};

// measured from the rendered artwork with getBBox, plus breathing room
const CROP = { x: 230, y: 128, w: 442, h: 367 };
const ASPECT = { card: 900 / 500, bare: CROP.w / CROP.h };

let seq = 0;

export default function KiteLogo({
  height = 46,
  className = "",
  showCard = false,
  variant = "brand",
  animate = false,
}) {
  const c = PALETTES[variant] || PALETTES.brand;
  const uid = `k${(seq = (seq + 1) % 10000)}`;
  const purple = `vibrantPurple-${uid}`;
  const face = `kiteFaceLight-${uid}`;
  const width = Math.round(height * (showCard ? ASPECT.card : ASPECT.bare));

  return (
    <div className={className} style={{ display: "inline-block", lineHeight: 0 }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={showCard ? "0 0 900 500" : `${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`}
        width={width}
        height={height}
        role="img"
        aria-label="Kite"
        className={animate ? "kite-art kite-art-animate" : "kite-art"}
      >
        <defs>
          <linearGradient id={purple} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.from} />
            <stop offset="60%" stopColor={c.mid} />
            <stop offset="100%" stopColor={c.to} />
          </linearGradient>

          <linearGradient id={face} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.faceFrom} />
            <stop offset="100%" stopColor={c.faceTo} />
          </linearGradient>

          <filter id={`cardShadow-${uid}`} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>

        {showCard && (
          <>
            <rect width="900" height="500" fill="#F6F7F9" />
            <rect
              x="80"
              y="50"
              width="740"
              height="400"
              rx="12"
              fill="#FFFFFF"
              filter={`url(#cardShadow-${uid})`}
            />
          </>
        )}

        <g transform="translate(190, 80)">
          {/* sail */}
          <g className="kite-sail">
            <path d="M 180,60 L 135,115 L 180,185 L 180,60 Z" fill={`url(#${face})`} />
            <path d="M 180,60 L 225,115 L 180,185 L 180,60 Z" fill={`url(#${purple})`} />
            <path
              d="M 180,60 L 180,185"
              stroke={c.spar}
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity={c.sparOpacity}
            />
            <path
              d="M 135,115 L 225,115"
              stroke={c.spar}
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity={c.sparOpacity}
            />
          </g>

          {/* string, curving into the K */}
          <path
            d="M 180,185
               C 175,230 110,250 80,280
               C 40,320 45,385 85,400
               C 135,415 190,370 215,315
               C 230,280 245,260 270,245"
            fill="none"
            stroke={`url(#${purple})`}
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <text
            x="240"
            y="310"
            fill={`url(#${purple})`}
            style={{
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: "128px",
              fontWeight: "800",
              letterSpacing: "-2px",
            }}
          >
            Kite
          </text>
        </g>
      </svg>
    </div>
  );
}

export { KiteLogo };
