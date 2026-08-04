interface SquiggleProps {
  className?: string;
  color?: string;
}

// Fixed hand-drawn underline path — same shape every render, used in place
// of a border under section/greeting headers.
export function Squiggle({ className, color = "var(--adhd-clay)" }: SquiggleProps) {
  return (
    <svg
      viewBox="0 0 200 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2,6 C30,1 50,9 80,5 C110,1 130,9 160,4 C175,2 185,7 198,3"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
