// Kite mark (P-036) — the CEO's pick: the two-tone fold of direction 4 with
// the spars cut clean through as negative space, from direction 3.
//
// The cross is punched out with a mask rather than painted white, so it is
// genuinely transparent: the same mark sits on the white header and on the
// purple sign-in panel without needing a second drawing.
const DIAMOND = "M32 3 L57 27 L32 61 L7 27 Z";
const LEFT = "M32 3 L7 27 L32 61 Z";
const RIGHT = "M32 3 L57 27 L32 61 Z";

const PALETTE = {
  brand: { light: "#a855f7", dark: "#6d10bd", tail: "#6d10bd" },
  reverse: { light: "#ffffff", dark: "#ddc4f7", tail: "#ffffff" },
};

export default function KiteLogo({ size = 30, animate = true, variant = "brand" }) {
  const c = PALETTE[variant] || PALETTE.brand;
  const maskId = `kite-cut-${variant}`;

  return (
    <svg
      width={size}
      height={size * (72 / 64)}
      viewBox="0 0 64 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? "kite-mark kite-mark-animate" : "kite-mark"}
      aria-hidden="true"
    >
      <defs>
        {/* white shows the sail, black punches the spars back out of it */}
        <mask id={maskId}>
          <path d={DIAMOND} fill="#fff" />
          <path
            d="M32 3 L32 61 M7 27 L57 27"
            stroke="#000"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </mask>
      </defs>

      <g className="kite-body" mask={`url(#${maskId})`}>
        <path d={LEFT} fill={c.light} />
        <path d={RIGHT} fill={c.dark} />
      </g>

      <path
        className="kite-tail"
        d="M32 61 C 33 65, 29 67, 26 71"
        stroke={c.tail}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
