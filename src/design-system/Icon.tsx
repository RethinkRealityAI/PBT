import type { SVGAttributes } from 'react';

type IconProps = SVGAttributes<SVGSVGElement>;
type FilledIconProps = IconProps;

const stroke = (children: React.ReactNode, w = '20', h = '20') =>
  function StrokeIcon(props: IconProps) {
    return (
      <svg
        width={w}
        height={h}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {children}
      </svg>
    );
  };

const filled = (children: React.ReactNode, w = '20', h = '20') =>
  function FilledIcon(props: FilledIconProps) {
    return (
      <svg width={w} height={h} viewBox="0 0 24 24" fill="currentColor" {...props}>
        {children}
      </svg>
    );
  };

export const Icon = {
  arrow: stroke(<path d="M5 12h14M13 5l7 7-7 7" />),
  back: stroke(<path d="M19 12H5M12 19l-7-7 7-7" />),
  close: stroke(<path d="M6 6l12 12M18 6L6 18" />, '18', '18'),
  mic: stroke(
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>,
  ),
  send: stroke(<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7Z" />),
  plus: stroke(<path d="M12 5v14M5 12h14" />),
  bell: stroke(
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />,
  ),
  user: stroke(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </>,
  ),
  chat: stroke(
    <path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12Z" />,
  ),
  spark: stroke(
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  ),
  paw: filled(
    <>
      <ellipse cx="6" cy="9" rx="2" ry="2.6" />
      <ellipse cx="10" cy="6" rx="2" ry="2.6" />
      <ellipse cx="14" cy="6" rx="2" ry="2.6" />
      <ellipse cx="18" cy="9" rx="2" ry="2.6" />
      <path d="M12 11c-3 0-6 3-6 6 0 2.2 1.8 3 3.5 2.5C11 19 11 18 12 18s1 1 2.5 1.5C16.2 20 18 19.2 18 17c0-3-3-6-6-6Z" />
    </>,
    '22',
    '22',
  ),
  book: stroke(
    <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4ZM4 16a4 4 0 0 1 4-4h12" />,
  ),
  history: stroke(
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />,
  ),
  trophy: stroke(
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM4 5h4v3a2 2 0 0 1-4 0V5ZM16 5h4v3a2 2 0 0 1-4 0V5ZM12 13v4M8 21h8M9 17h6" />,
  ),
  settings: stroke(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>,
  ),
  search: stroke(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </>,
  ),
  flame: stroke(
    <path d="M12 2c0 4 4 4 4 9a4 4 0 0 1-8 0c0-2 1-3 1-5 0 2 3 2 3-4ZM7 14a5 5 0 0 0 10 0" />,
  ),
  star: filled(
    <path d="M12 2.5l2.95 6 6.6.95-4.78 4.65 1.13 6.55L12 17.6l-5.9 3.05 1.13-6.55L2.45 9.45l6.6-.95Z" />,
  ),
  check: stroke(
    <path d="M5 12l5 5L20 7" strokeWidth={2.4} />,
    '18',
    '18',
  ),
  /** Filled circle + white check — use `color` / `currentColor` for badge fill. */
  checkBadge: (props: IconProps) => (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M7.5 12.2 10.8 15.5 16.8 8.5"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  voice: stroke(
    <path d="M3 12h2M19 12h2M7 8v8M11 5v14M17 8v8M14 9v6" />,
  ),
  text: stroke(<path d="M4 7h16M9 7v13M4 7V4h16v3" />),
  moon: stroke(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />),
  chevronDown: stroke(<path d="M6 9l6 6 6-6" />, '18', '18'),
  sun: stroke(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>,
  ),
} as const;

export type IconKey = keyof typeof Icon;
