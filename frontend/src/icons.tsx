import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Icon = {
  select: (p: P) => (
    <Svg {...p}>
      <path d="M5 3l14 7-6 2-2 6z" />
    </Svg>
  ),
  text: (p: P) => (
    <Svg {...p}>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </Svg>
  ),
  signature: (p: P) => (
    <Svg {...p}>
      <path d="M3 16c3-6 5-9 7-9s-1 8 1 8 3-5 5-5 1 4 4 4M3 20h18" />
    </Svg>
  ),
  initials: (p: P) => (
    <Svg {...p}>
      <path d="M15 4l5 5L9 20H4v-5z" />
    </Svg>
  ),
  date: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Svg>
  ),
  check: (p: P) => (
    <Svg strokeWidth={1.9} {...p}>
      <path d="M5 12l5 5 9-10" />
    </Svg>
  ),
  cross: (p: P) => (
    <Svg strokeWidth={1.9} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  sparkle: (p: P) => (
    <Svg strokeWidth={1.8} {...p}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3" />
    </Svg>
  ),
  download: (p: P) => (
    <Svg strokeWidth={1.8} {...p}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  ),
  file: (p: P) => (
    <Svg {...p}>
      <path d="M14 3H6v18h12V7z" />
      <path d="M14 3v4h4M9 14h6M9 17h4" />
    </Svg>
  ),
  person: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Svg>
  ),
  left: (p: P) => (
    <Svg strokeWidth={2} {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  ),
  right: (p: P) => (
    <Svg strokeWidth={2} {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
}
