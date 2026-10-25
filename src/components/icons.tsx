import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export const PinIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

export const ClockIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const BagIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
)

export const GridIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </svg>
)

export const TagIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 12V4h8l10 10-8 8L3 12Z" />
    <circle cx="7.5" cy="8.5" r="1.2" />
  </svg>
)

export const TruckIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 6h11v10H2z" />
    <path d="M13 9h4l4 4v3h-8z" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </svg>
)

export const SearchIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const CloseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const ArrowLeftIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)

export const ArrowRightIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const SparkleIcon = (p: P) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}>
    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
  </svg>
)

export const WhatsappIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20l1.2-4A8 8 0 1 1 8 18.8L4 20Z" />
    <path d="M9 9.5c.3 2 2.5 4.2 5 5l1.2-1.2-1.8-1-.8.6c-.8-.3-1.7-1.2-2-2l.6-.8-1-1.8L9 9.5Z" />
  </svg>
)

export const InstagramIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="5" />
    <circle cx="12" cy="12" r="3.5" />
    <circle cx="16.8" cy="7.2" r=".6" fill="currentColor" />
  </svg>
)
