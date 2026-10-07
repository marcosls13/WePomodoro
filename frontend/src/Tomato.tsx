// A friendly tomato mascot. Decorative: hidden from assistive tech.
export default function Tomato({
  size = 120,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`tomato ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="100" cy="188" rx="54" ry="7" fill="#d92d20" opacity=".15" />
      <g className="tomato-body">
        <path
          d="M100 46C152 40 184 74 181 118C178 162 142 186 100 186C58 186 22 162 19 118C16 74 48 40 100 46Z"
          fill="#e5332a"
        />
        <path
          d="M100 46C152 40 184 74 181 118C178 162 142 186 100 186C58 186 22 162 19 118C16 74 48 40 100 46Z"
          fill="none"
          stroke="#b4231a"
          strokeWidth="4"
          opacity=".35"
        />
        <ellipse
          cx="56"
          cy="84"
          rx="16"
          ry="9"
          transform="rotate(-35 56 84)"
          fill="#fff"
          opacity=".45"
        />
        <g className="tomato-leaves">
          <path
            d="M100 52C86 30 62 30 46 42C64 46 80 54 100 56Z"
            fill="#3fa34d"
          />
          <path
            d="M100 52C114 30 138 30 154 42C136 46 120 54 100 56Z"
            fill="#3fa34d"
          />
          <path
            d="M100 56C92 38 96 22 100 12C106 24 110 40 100 56Z"
            fill="#2e8b3d"
          />
        </g>
        <g className="tomato-eyes">
          <ellipse cx="70" cy="112" rx="10" ry="13" fill="#3b1212" />
          <ellipse cx="130" cy="112" rx="10" ry="13" fill="#3b1212" />
          <circle cx="73" cy="107" r="4" fill="#fff" />
          <circle cx="133" cy="107" r="4" fill="#fff" />
        </g>
        <ellipse cx="48" cy="136" rx="13" ry="8" fill="#ffb4ae" opacity=".85" />
        <ellipse
          cx="152"
          cy="136"
          rx="13"
          ry="8"
          fill="#ffb4ae"
          opacity=".85"
        />
        <path d="M82 130Q100 160 118 130Z" fill="#7a1212" />
        <path d="M91 142Q100 150 109 142Q100 137 91 142Z" fill="#ff8f88" />
      </g>
    </svg>
  );
}
