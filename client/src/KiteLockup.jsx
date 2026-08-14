// Kite lockup (P-037): the wordmark and the mark are one drawing. The K's
// lower leg keeps going — it loops beneath the word and flies up as the string
// of the kite, so the type and the icon are literally connected.
//
// The word is set as SVG text so it stays selectable-free and crisp; the loop
// is tuned to meet the K's leg at this weight and size.
const PALETTE = {
  brand: { text: "#6d10bd", line: "#8b14dd", light: "#a855f7", dark: "#6d10bd" },
  reverse: { text: "#ffffff", line: "#ffffff", light: "#ffffff", dark: "#ddc4f7" },
};

export default function KiteLockup({ height = 34, variant = "brand", animate = true }) {
  const c = PALETTE[variant] || PALETTE.brand;
  const maskId = `lockup-cut-${variant}`;

  return (
    <svg
      viewBox="0 0 208 96"
      height={height}
      width={height * (208 / 96)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kite"
      className={animate ? "lockup lockup-animate" : "lockup"}
    >
      <defs>
        <mask id={maskId}>
          <path d="M168 6 L192 26 L168 54 L144 26 Z" fill="#fff" />
          <path
            d="M168 6 L168 54 M144 26 L192 26"
            stroke="#000"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </mask>
      </defs>

      {/* the string: leaves the K's leg, loops, and climbs to the kite */}
      <path
        className="lockup-string"
        d="M46 79
           C 41 92, 19 96, 14 86
           C 10 77, 25 73, 27 83
           C 30 94, 62 94, 98 89
           C 130 85, 148 70, 167 55"
        stroke={c.line}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <g className="lockup-kite" mask={`url(#${maskId})`}>
        <path d="M168 6 L144 26 L168 54 Z" fill={c.light} />
        <path d="M168 6 L192 26 L168 54 Z" fill={c.dark} />
      </g>

      <text
        x="6"
        y="78"
        fill={c.text}
        fontFamily='"Helvetica Neue", Inter, system-ui, -apple-system, sans-serif'
        fontSize="62"
        fontWeight="700"
        letterSpacing="-3"
      >
        Kite
      </text>
    </svg>
  );
}
