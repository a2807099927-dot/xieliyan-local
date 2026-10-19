// HTML 设计稿 inline SVG：统一 stroke=currentColor，路径与设计稿一致。
import type { SVGProps } from 'react';

type IdeSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number | string;
};

function base(size = 20, strokeWidth: number | string = 2): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

export function IdeSvgBookshelf(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
export function IdeSvgWrite(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
export function IdeSvgUsers(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
export function IdeSvgOutlineBook(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h7M9 11h7" />
    </svg>
  );
}
export function IdeSvgMemory(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
export function IdeSvgKanban(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  // 看板：三列卡片，避免看起来像带上下横线的表格格子
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="10" rx="1.5" />
      <rect x="16" y="4" width="5" height="13" rx="1.5" />
    </svg>
  );
}
export function IdeSvgLab(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 2, ...rest } = p;
  // 拆书神器：翻开的书 + 放大镜，体现「分析拆解书籍」
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M12 6a2 2 0 0 0-2-2H4v16h6a2 2 0 0 1 2 2" />
      <path d="M12 6a2 2 0 0 1 2-2h6v16h-6a2 2 0 0 0-2 2" />
      <circle cx="18" cy="17" r="2.6" />
      <path d="m20 19 1.6 1.6" />
    </svg>
  );
}
export function IdeSvgCompass(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
export function IdeSvgGlobe(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
export function IdeSvgChat(p: IdeSvgProps) {
  const { size = 19, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}
export function IdeSvgDownload(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}
export function IdeSvgSettings(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  // 标准齿轮（Lucide settings），不再用放射线太阳造型
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export function IdeSvgSidebar(p: IdeSvgProps) {
  const { size = 17, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}
export function IdeSvgUndo(p: IdeSvgProps) {
  const { size = 17, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}
export function IdeSvgRedo(p: IdeSvgProps) {
  const { size = 17, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}
export function IdeSvgFormat(p: IdeSvgProps) {
 const { size = 17, strokeWidth = 1.8, ...rest } = p;
 return (
  <svg {...base(size, strokeWidth)} {...rest}>
   <path d="M3 5h18" />
   <path d="M3 9.5h14" />
   <path d="M3 14h18" />
   <path d="M3 18.5h10" />
  </svg>
 );
}
export function IdeSvgRoute(p: IdeSvgProps) {
  const { size = 13, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12" />
    </svg>
  );
}
export function IdeSvgSpark(p: IdeSvgProps) {
  const { size = 13, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}
export function IdeSvgSearch(p: IdeSvgProps) {
  const { size = 17, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
export function IdeSvgHistory(p: IdeSvgProps) {
  const { size = 17, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}
export function IdeSvgSplit(p: IdeSvgProps) {
  const { size = 17, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18" />
    </svg>
  );
}

export function IdeSvgClock3(p: IdeSvgProps) {
  const { size = 20, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12H16" />
    </svg>
  );
}
export function IdeSvgPlus(p: IdeSvgProps) {
  const { size = 15, strokeWidth = 2, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IdeSvgChevronRight(p: IdeSvgProps) {
  const { size = 15, strokeWidth = 2, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
export function IdeSvgChevronDown(p: IdeSvgProps) {
  const { size = 10, strokeWidth = 2.5, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
export function IdeSvgAt(p: IdeSvgProps) {
  const { size = 15, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}
export function IdeSvgPaperclip(p: IdeSvgProps) {
  const { size = 15, strokeWidth = 1.8, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
export function IdeSvgClose(p: IdeSvgProps) {
  const { size = 11, strokeWidth = 2.5, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
export function IdeSvgCheck(p: IdeSvgProps) {
  const { size = 12, strokeWidth = 2, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function IdeSvgInfo(p: IdeSvgProps) {
  const { size = 12, strokeWidth = 2, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
export function IdeSvgWarn(p: IdeSvgProps) {
  const { size = 12, strokeWidth = 2, ...rest } = p;
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
