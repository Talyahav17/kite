// P-028: the illustrated half of the sign-in screen. Drawn here as inline SVG
// rather than shipped as an image — it stays sharp at any size, themes off the
// brand violet, and adds nothing to load.
export default function SkyPanel() {
  return (
    <svg
      className="sky"
      viewBox="0 0 520 620"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky-bg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="sail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ede9fe" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <mask id="sky-cut">
          <path d="M336 300 L 384 340 L 300 400 L 276 330 Z" fill="#fff" />
          <path
            d="M336 300 L 300 400 M276 330 L 384 340"
            stroke="#000"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </mask>
      </defs>

      <rect width="520" height="620" fill="url(#sky-bg)" />
      <circle cx="380" cy="120" r="190" fill="url(#glow)" />

      {/* clouds */}
      <g fill="#ffffff" opacity="0.35">
        <ellipse cx="90" cy="150" rx="70" ry="26" />
        <ellipse cx="140" cy="140" rx="48" ry="22" />
        <ellipse cx="410" cy="300" rx="80" ry="28" />
        <ellipse cx="360" cy="292" rx="46" ry="20" />
        <ellipse cx="180" cy="470" rx="90" ry="30" />
        <ellipse cx="240" cy="462" rx="52" ry="22" />
      </g>

      {/* horizon arc, a nod to the world you're planning across */}
      <g opacity="0.3" stroke="#ffffff" fill="none" strokeWidth="1.5">
        <path d="M-40 560 Q 260 460 560 560" />
        <path d="M-40 590 Q 260 490 560 590" />
      </g>

      {/* Route between two stops on the ground. It deliberately stops short of
          the kite — the string is the solid curve below, not this. */}
      <g className="sky-route">
        <path
          d="M60 545 C 130 512, 190 498, 250 486"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeDasharray="7 9"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
        <circle cx="60" cy="545" r="6" fill="#ffffff" opacity="0.75" />
        <circle cx="250" cy="486" r="6" fill="#ffffff" opacity="0.75" />
      </g>

      {/* the kite, mid-flight */}
      <g className="sky-kite">
        {/* the string: the one line that actually meets the kite */}
        <path
          d="M300 400 C 286 434, 252 458, 216 452 C 186 447, 178 416, 200 404
             C 218 394, 236 410, 226 424 C 218 435, 202 432, 200 422"
          stroke="#ffffff"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* same language as the mark: two tones, spars cut out not painted */}
        <g mask="url(#sky-cut)">
          <path d="M336 300 L 276 330 L 300 400 Z" fill="#ffffff" />
          <path d="M336 300 L 384 340 L 300 400 Z" fill="#e4d3fb" />
        </g>
      </g>
    </svg>
  );
}
