import type { ReactNode, Ref } from 'react';
import { theme, Typography } from 'antd';

/** Shared with Owner setup; presentation only, with no auth or storage effects. */
export function SetupPageHeading({ icon, title, description, headingRef }: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const { token } = theme.useToken();
  return <div className="mb-9 sm:mb-11">
    <div className="flex items-center gap-3 sm:block">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: token.colorPrimaryBg, color: token.colorPrimary }}>{icon}</div>
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-2xl font-semibold tracking-tight sm:mt-5" style={{ color: token.colorText }}>{title}</h1>
    </div>
    {description && <Typography.Text type="secondary" className="mt-2 block max-w-lg text-sm leading-relaxed">{description}</Typography.Text>}
  </div>;
}

export function SetupSurface({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  return <div className="w-full rounded-xl border p-5 shadow-sm sm:p-7" style={{ borderColor: token.colorBorder, background: token.colorBgContainer }}>{children}</div>;
}
