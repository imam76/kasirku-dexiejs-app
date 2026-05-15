import { Tour } from 'antd';
import type { TourProps } from 'antd';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useI18n } from '@/hooks/useI18n';

const TOUR_STORAGE_KEY = 'kasirku-workflow-tour-dismissed';
const STOCK_SAVED_EVENT = 'kasirku-workflow-tour-stock-saved';
const ROUTE_SETTLE_DELAY_MS = 120;

type WorkflowRoute = '/' | '/stock' | '/units' | '/transaction' | '/history';

type WorkflowTourStep = {
  route: WorkflowRoute;
  selector: string;
  title: ReactNode;
  description: ReactNode;
  placement?: NonNullable<TourProps['steps']>[number]['placement'];
  targetClickAction?: 'next' | 'close' | 'pause';
};

type AppWorkflowTourProps = {
  children?: (startTour: () => void) => ReactNode;
};

const getVisibleTarget = (selector: string) => {
  if (typeof document === 'undefined') return null;

  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }) ?? null;
};

export function AppWorkflowTour({ children }: AppWorkflowTourProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [waitingForStockSave, setWaitingForStockSave] = useState(false);

  const workflowSteps = useMemo<WorkflowTourStep[]>(
    () => [
      {
        route: '/',
        selector: '[data-tour="dashboard-stock"]',
        title: t('tour.dashboardStockTitle'),
        description: t('tour.dashboardStockDescription'),
        placement: 'bottom',
        targetClickAction: 'next',
      },
      {
        route: '/stock',
        selector: '[data-tour="stock-add-product"]',
        title: t('tour.stockAddTitle'),
        description: t('tour.stockAddDescription'),
        placement: 'bottomRight',
        targetClickAction: 'pause',
      },
      {
        route: '/units',
        selector: '[data-tour="units-workflow"]',
        title: t('tour.unitsTitle'),
        description: t('tour.unitsDescription'),
        placement: 'bottom',
      },
      {
        route: '/transaction',
        selector: '[data-tour="transaction-search"]',
        title: t('tour.transactionSearchTitle'),
        description: t('tour.transactionSearchDescription'),
        placement: 'bottom',
        targetClickAction: 'close',
      },
      {
        route: '/transaction',
        selector: isMobile
          ? '[data-tour="transaction-mobile-cart"], [data-tour="transaction-scan"], [data-tour="transaction-search"]'
          : '[data-tour="transaction-desktop-cart"], [data-tour="transaction-search"]',
        title: t('tour.transactionCheckoutTitle'),
        description: isMobile
          ? t('tour.transactionCheckoutDescriptionMobile')
          : t('tour.transactionCheckoutDescription'),
        placement: isMobile ? 'top' : 'left',
        targetClickAction: isMobile ? 'close' : undefined,
      },
      {
        route: '/history',
        selector: '[data-tour="history-results"]',
        title: t('tour.historyTitle'),
        description: t('tour.historyDescription'),
        placement: 'bottom',
      },
    ],
    [isMobile, t],
  );

  const steps = useMemo<TourProps['steps']>(
    () =>
      workflowSteps.map((step) => ({
        title: step.title,
        description: step.description,
        placement: step.placement,
        target: () => getVisibleTarget(step.selector) ?? document.body,
      })),
    [workflowSteps],
  );

  const markDismissed = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  const startTour = useCallback(() => {
    setOpen(true);
    setCurrent(0);
    setPendingStep(null);
    setWaitingForStockSave(false);

    if (location.pathname !== '/') {
      navigate({ to: '/' });
    }
  }, [location.pathname, navigate]);

  const closeTour = useCallback(() => {
    markDismissed();
    setOpen(false);
    setPendingStep(null);
    setWaitingForStockSave(false);
  }, [markDismissed]);

  const pauseTour = useCallback(() => {
    setOpen(false);
    setPendingStep(null);
    setWaitingForStockSave(true);
  }, []);

  const moveToStep = useCallback(
    (nextStep: number) => {
      const step = workflowSteps[nextStep];
      if (!step) {
        closeTour();
        return;
      }

      if (location.pathname !== step.route) {
        setPendingStep(nextStep);
        navigate({ to: step.route });
        return;
      }

      setCurrent(nextStep);
    },
    [closeTour, location.pathname, navigate, workflowSteps],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(TOUR_STORAGE_KEY) === 'true') return;
    if (location.pathname !== '/') return;

    const timer = window.setTimeout(() => {
      setOpen(true);
      setCurrent(0);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (!open || pendingStep === null) return;

    const step = workflowSteps[pendingStep];
    if (!step || location.pathname !== step.route) return;

    const timer = window.setTimeout(() => {
      setCurrent(pendingStep);
      setPendingStep(null);
    }, ROUTE_SETTLE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [location.pathname, open, pendingStep, workflowSteps]);

  useEffect(() => {
    if (!waitingForStockSave) return;

    const handleStockSaved = () => {
      const transactionStep = workflowSteps.findIndex((step) => step.route === '/transaction');
      if (transactionStep === -1) {
        closeTour();
        return;
      }

      setWaitingForStockSave(false);
      setOpen(true);
      moveToStep(transactionStep);
    };

    window.addEventListener(STOCK_SAVED_EVENT, handleStockSaved);
    return () => window.removeEventListener(STOCK_SAVED_EVENT, handleStockSaved);
  }, [closeTour, moveToStep, waitingForStockSave, workflowSteps]);

  useEffect(() => {
    if (!open) return;

    const handleTargetClick = (event: MouseEvent) => {
      const step = workflowSteps[current];
      if (!step?.targetClickAction) return;
      if (!(event.target instanceof Node)) return;

      const target = getVisibleTarget(step.selector);
      if (!target?.contains(event.target)) return;

      window.setTimeout(() => {
        if (step.targetClickAction === 'close') {
          closeTour();
          return;
        }

        if (step.targetClickAction === 'pause') {
          pauseTour();
          return;
        }

        moveToStep(current + 1);
      }, 0);
    };

    document.addEventListener('click', handleTargetClick, true);
    return () => document.removeEventListener('click', handleTargetClick, true);
  }, [closeTour, current, moveToStep, open, pauseTour, workflowSteps]);

  return (
    <>
      {children?.(startTour)}
      <Tour
        open={open}
        current={current}
        steps={steps}
        onChange={moveToStep}
        onClose={closeTour}
        onFinish={closeTour}
      />
    </>
  );
}
