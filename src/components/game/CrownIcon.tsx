interface CrownIconProps {
  size?: number;
  className?: string;
  color?: string;
}

export function CrownIcon({ size = 24, className = '', color = '#1B2340' }: CrownIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 18H21V20H3V18ZM3 16L5 6L9 10L12 4L15 10L19 6L21 16H3Z"
        fill={color}
        stroke="white"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
