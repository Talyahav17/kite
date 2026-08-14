// Kite mark (P-034).
//
// Deliberately geometric rather than illustrative: a diamond sail folded into
// four facets that catch the light differently, and a single restrained tail
// stroke. The earlier version drew a cartoon kite with a looping curl, which
// read as childish at small sizes and fought the rest of the interface.
const SAIL_TOP = "M32 3 L57 27 L32 27 Z";
const SAIL_LEFT = "M32 3 L7 27 L32 27 Z";
const SAIL_LOWER_LEFT = "M7 27 L32 61 L32 27 Z";
const SAIL_LOWER_RIGHT = "M57 27 L32 61 L32 27 Z";

export default function KiteLogo({ size = 30, animate = true }) {
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
      <g className="kite-body">
        {/* four facets, lit from the upper left */}
        <path d={SAIL_LEFT} fill="#a855f7" />
        <path d={SAIL_TOP} fill="#8b14dd" />
        <path d={SAIL_LOWER_LEFT} fill="#7a0fd0" />
        <path d={SAIL_LOWER_RIGHT} fill="#5b0fa0" />
      </g>

      {/* tail: one calm stroke, no curl */}
      <path
        className="kite-tail"
        d="M32 61 C 33 65, 29 67, 26 71"
        stroke="#7a0fd0"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
