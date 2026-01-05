import type { SVGProps } from "react";

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      {...props}
    >
      {/* Bucket body */}
      <path
        d="M12 20 L16 52 C16.5 54.5 19 56 22 56 L42 56 C45 56 47.5 54.5 48 52 L52 20"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Bucket rim */}
      <ellipse
        cx="32"
        cy="20"
        rx="21"
        ry="6"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />

      {/* Scout magnifying glass */}
      <circle
        cx="38"
        cy="38"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />

      {/* Handle */}
      <line
        x1="45"
        y1="45"
        x2="52"
        y2="52"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Focus dot */}
      <circle cx="38" cy="38" r="3" fill="currentColor" />
    </svg>
  );
}
