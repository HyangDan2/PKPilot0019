import type { JSX, ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPause = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <rect x="7" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconStop = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconRecord = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconOverdub = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="9.5" cy="12" r="5.4" />
    <circle cx="14.8" cy="12" r="5.4" opacity="0.55" />
  </Svg>
);

export const IconTap = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 4v4" />
    <path d="M6.3 6.3l2.4 2.4" />
    <path d="M17.7 6.3l-2.4 2.4" />
    <circle cx="12" cy="14" r="5" />
  </Svg>
);

export const IconMetronome = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M9.5 3.5h5l4 17h-13z" />
    <path d="M12 17.5L16 7" />
    <path d="M8 17.5h8" />
  </Svg>
);

export const IconMoon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M20 14.2A8 8 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />
  </Svg>
);

export const IconSun = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Svg>
);

export const IconDots = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconKeyboard = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 18v-4.5M10.2 18v-4.5M13.8 18v-4.5M17.5 18v-4.5" />
    <path d="M2.5 13.5h19" />
  </Svg>
);

export const IconSliders = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M5 4v6M5 14v6M12 4v9M12 17v3M19 4v3M19 11v9" />
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="15" r="2" />
    <circle cx="19" cy="9" r="2" />
  </Svg>
);

export const IconPlug = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
    <path d="M12 17v4" />
  </Svg>
);

export const IconDownload = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 3v11" />
    <path d="M7.5 10L12 14.5 16.5 10" />
    <path d="M4 17.5v2.5h16v-2.5" />
  </Svg>
);

export const IconUndo = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M4 9.5h9.5a5 5 0 0 1 0 10H8" />
    <path d="M7.5 5.5L3.8 9.5l3.7 4" />
  </Svg>
);

export const IconTrash = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M4 7h16" />
    <path d="M9.5 7V4.8h5V7" />
    <path d="M6.2 7l1 12.2h9.6L17.8 7" />
    <path d="M10.4 10.5v5.5M13.6 10.5v5.5" />
  </Svg>
);

export const IconPlus = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconClose = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconCheck = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const IconFolder = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M3.5 7.5h6l2 2h9v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M3.5 7.5V5.8A1.3 1.3 0 0 1 4.8 4.5h3.4l1.8 2" />
  </Svg>
);

export const IconSave = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M4.5 5.5A1 1 0 0 1 5.5 4.5h10l4 4v10a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
    <path d="M8 4.5v5h7v-5M8 19.5v-6h8v6" />
  </Svg>
);

export const IconSpark = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
    <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Svg>
);

export const IconExternal = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5L11 13" />
    <path d="M18 14.5v4.2a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 18.7V7.3A1.3 1.3 0 0 1 5.3 6H10" />
  </Svg>
);

export const IconHeadphones = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <rect x="3" y="14" width="4" height="6" rx="1.6" />
    <rect x="17" y="14" width="4" height="6" rx="1.6" />
  </Svg>
);

export const IconHelp = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M9.6 9.3a2.6 2.6 0 0 1 4.9 1.1c0 1.7-2.4 2-2.4 3.6" />
    <circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconFile = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M6 3.5h7l5 5v12H6z" />
    <path d="M13 3.5v5h5" />
    <path d="M9.5 14.5c1.6 0 3 1.6 3 3.2" opacity="0.5" />
  </Svg>
);
