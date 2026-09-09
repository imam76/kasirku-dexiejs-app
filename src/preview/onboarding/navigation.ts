import { SCREENS, type Overlay, type Screen } from './model';

const overlays: NonNullable<Overlay>[] = ['terms', 'privacy', 'modules', 'backup', 'scenarios', 'menu', 'invoice', 'history', 'help',
  'business-type', 'accounting-template', 'accounting-currency', 'date-cutoffDate', 'date-fiscalPeriodStart',
  'date-fiscalPeriodEnd', 'date-currentPeriodStart', 'date-currentPeriodEnd'];
export const isDialogOverlay = (overlay: Overlay) => overlay !== null && ['terms', 'privacy', 'modules', 'backup', 'scenarios', 'menu', 'invoice', 'history', 'help'].includes(overlay);
export const navigationHref = (screen: Screen, overlay: Overlay) => `/${screen}${overlay ? `?overlay=${overlay}` : ''}`;
export const readNavigation = (href: string): { screen: Screen; overlay: Overlay } => {
  const [path, search] = href.split('?');
  const candidate = path.replace(/^\//, '');
  const screen = SCREENS.find((value) => value === candidate) ?? 'welcome';
  const overlay = overlays.find((value) => value === new URLSearchParams(search).get('overlay')) ?? null;
  return { screen, overlay };
};
