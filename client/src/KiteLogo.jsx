// Official Kite mark (P-022), traced from the CEO-supplied artwork: a tilted
// violet sail with curved white spars and a crescent highlight, and a single
// ribbon tail that passes under the sail, loops below-left, and rises back to
// the sail's tether point.
//
// NOTE: this is a hand-traced vector of the supplied image, not the original
// asset. Save the source file to client/public/ for a pixel-exact swap.
const SAIL = "M74 2 L90 29 L51 55 L44 25 Z";

export default function KiteLogo({ size = 38, animate = true }) {
  return (
    <svg
      width={size}
      height={size * (110 / 96)}
      viewBox="0 0 96 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? "kite-mark kite-mark-animate" : "kite-mark"}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="kite-sail" x1="44" y1="2" x2="88" y2="52">
          <stop offset="0" stopColor="#a21cef" />
          <stop offset="1" stopColor="#7a0fd0" />
        </linearGradient>
        {/* keeps the spars inside the sail, as in the artwork */}
        <clipPath id="kite-clip">
          <path d={SAIL} />
        </clipPath>
      </defs>

      {/* tail: one ribbon — under the sail, around the loop, back to the tether */}
      <path
        className="kite-tail"
        d="M74 52
           C 60 57, 46 59, 33 65
           C 16 73, 3 85, 7 96
           C 11 105, 26 106, 34 96
           C 42 86, 41 72, 51 55"
        stroke="#7a0fd0"
        strokeWidth="4.6"
        strokeLinecap="round"
        fill="none"
      />

      <g className="kite-body">
        <path d={SAIL} fill="url(#kite-sail)" />
        <g clipPath="url(#kite-clip)" stroke="#ffffff" fill="none" strokeLinecap="round">
          <path d="M73 5 C 64 23, 56 39, 51 54" strokeWidth="2.2" />
          <path d="M46 26 C 60 33, 74 33, 86 29" strokeWidth="2.2" />
          <path d="M72 6 C 80 17, 83 28, 81 41" strokeWidth="2.4" />
        </g>
      </g>
    </svg>
  );
}
