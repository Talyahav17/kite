// Kite logo (P-048) — tuned against the CEO's reference image.
//
// The sail is four facets with curved lower edges rather than a flat diamond,
// so it reads as fabric catching wind, and the crossbar curves with it. That
// geometry is from the CEO's own first draft; the wordmark is set as text in a
// rounded face rather than drawn, which keeps it crisp at every size.
//
// Sized by HEIGHT with the width derived, and the viewBox cropped to the
// measured artwork — the loop makes the drawing nearly square, so sizing by
// width overflows a header bar.
const PALETTES = {
  brand: {
    light: "#9D1AFF",
    primary: "#7200CB",
    dark: "#4D008C",
    spar: "#FFFFFF",
    sparOpacity: 0.9,
  },
  reverse: {
    light: "#FFFFFF",
    primary: "#EBD8FF",
    dark: "#C9A3F0",
    spar: "#6B00B8",
    sparOpacity: 0.45,
  },
};

// measured from the rendered drawing with getBBox, plus a little air
const CROP = { x: 132, y: 56, w: 526, h: 373 };

let seq = 0;

export default function KiteLogo({ height = 46, className = "", variant = "brand", animate = false }) {
  const c = PALETTES[variant] || PALETTES.brand;
  const uid = `k${(seq = (seq + 1) % 10000)}`;
  const grad = `kiteGrad-${uid}`;
  const face = `kiteFace-${uid}`;
  const width = Math.round(height * (CROP.w / CROP.h));

  return (
    <div className={className} style={{ display: "inline-block", lineHeight: 0 }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`}
        width={width}
        height={height}
        role="img"
        aria-label="Kite"
        className={animate ? "kite-art kite-art-animate" : "kite-art"}
      >
        <defs>
          <linearGradient id={grad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="55%" stopColor={c.primary} />
            <stop offset="100%" stopColor={c.dark} />
          </linearGradient>
          <linearGradient id={face} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="100%" stopColor={c.primary} />
          </linearGradient>
        </defs>

        {/* Four panels split by spine and crossbar, as in the reference: a wide
            diamond whose lower edges bow outward like fabric under wind. */}
        {/* Tilted about the tether point, as in the reference — an upright kite
            looks parked, a leaning one looks like it is flying. */}
        <g className="kite-sail" transform="rotate(13 296 250)">
          <path d="M 322,76 L 232,150 L 300,152 Z" fill={`url(#${face})`} />
          <path d="M 322,76 L 356,158 L 300,152 Z" fill={`url(#${grad})`} />
          <path d="M 232,150 Q 252,198 296,250 L 300,152 Z" fill={c.primary} />
          <path d="M 356,158 Q 342,204 296,250 L 300,152 Z" fill={c.dark} />

          <path
            d="M 322,76 L 296,250"
            stroke={c.spar}
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity={c.sparOpacity}
            fill="none"
          />
          <path
            d="M 232,150 Q 300,178 356,158"
            stroke={c.spar}
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity={c.sparOpacity}
            fill="none"
          />
        </g>

        {/* the string: falls from the sail, loops, and rises into the K */}
        <path
          className="kite-string"
          d="M 296,250
             C 291,292 214,302 182,324
             C 142,350 132,394 158,412
             C 184,430 242,414 272,366
             C 292,332 322,292 372,254"
          fill="none"
          stroke={`url(#${grad})`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <text
          x="352"
          y="345"
          fill={`url(#${grad})`}
          style={{
            fontFamily:
              'ui-rounded, "SF Pro Rounded", "Avenir Next Rounded", Nunito, "Segoe UI", system-ui, sans-serif',
            fontSize: "170px",
            fontWeight: "800",
            letterSpacing: "-6px",
          }}
        >
          Kite
        </text>
      </svg>
    </div>
  );
}

export { KiteLogo };
