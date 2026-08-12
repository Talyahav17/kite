// Official Kite logo (P-006): purple diamond kite, white struts, looping tail.
// Geometry traced from the CEO-supplied artwork.
export default function KiteLogo({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="kite-fill" x1="44" y1="10" x2="104" y2="60">
          <stop offset="0" stopColor="#8b2fe8" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* diamond, long axis tilted toward upper right */}
      <path d="M78 3 L108 36 L62 63 L43 22 Z" fill="url(#kite-fill)" />
      {/* struts between opposite corners */}
      <path
        d="M78 3 L62 63 M43 22 L108 36"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* tail: sweeps down-left, crosses itself in one big loop */}
      <path
        d="M62 63
           C 56 76, 45 86, 32 90
           C 16 94, 6 86, 10 78
           C 13 71, 24 70, 28 77
           C 32 84, 24 92, 14 90"
        stroke="#7c3aed"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
