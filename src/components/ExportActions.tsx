import { CloseOutlined, DownOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import type { ButtonProps, MenuProps } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import type { ExportTarget } from '@/utils/export';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useI18n } from '@/hooks/useI18n';

type ExportTargetAction = {
  key: Exclude<ExportTarget, 'auto'>;
  label: string;
};

export type ExportFormatAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onExport: (target: ExportTarget) => void | Promise<void>;
  targets?: ExportTargetAction[];
};

type ExportActionsProps = {
  formats: ExportFormatAction[];
  disabled?: boolean;
  buttonClassName?: string;
  buttonType?: ButtonProps['type'];
  label?: string;
};

export default function ExportActions({
  formats,
  disabled = false,
  buttonClassName,
  buttonType = 'primary',
  label,
}: ExportActionsProps) {
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const buttonLabel = label ?? t('common.export');
  const defaultTargets = useMemo<ExportTargetAction[]>(() => [
    { key: 'share', label: t('common.share') },
    { key: 'save', label: t('common.saveToFile') },
  ], [t]);

  const isDisabled = disabled || formats.length === 0 || formats.every((format) => format.disabled);
  const isExporting = exportingKey !== null;

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      formats.map((format) => ({
        key: format.key,
        label: format.label,
        icon: format.icon,
        disabled: format.disabled || isExporting,
        children: (format.targets ?? defaultTargets).map((target) => ({
          key: `${format.key}:${target.key}`,
          label: target.label,
        })),
      })),
    [formats, defaultTargets, isExporting],
  );

  const handleExport = async (format: ExportFormatAction, target: ExportTarget) => {
    if (isExporting) return;

    const nextExportingKey = `${format.key}:${target}`;
    setExportingKey(nextExportingKey);
    try {
      await format.onExport(target);
    } finally {
      setExportingKey(null);
    }
  };

  const handleMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    const [formatKey, targetKey] = String(key).split(':');
    const format = formats.find((item) => item.key === formatKey);
    if (!format || format.disabled) return;

    void handleExport(format, (targetKey || 'auto') as ExportTarget);
  };

  const button = (
    <Button
      type={buttonType}
      className={buttonClassName}
      icon={<DownloadOutlined className="text-[12px]" />}
      disabled={isDisabled || isExporting}
      loading={isExporting}
      onClick={isMobile ? () => setDrawerOpen(true) : undefined}
    >
      {buttonLabel}
      {!isMobile ? <DownOutlined className="text-[10px]" /> : null}
    </Button>
  );

  if (!isMobile) {
    return (
      <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']} placement="bottomRight">
        {button}
      </Dropdown>
    );
  }

  return (
    <>
      {button}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-800">{buttonLabel}</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label={t('common.closeExportOptions')}
              >
                <CloseOutlined className="text-[16px]" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {formats.map((format) => {
                const targets = format.targets ?? defaultTargets;

                return (
                  <div key={format.key} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      {format.icon}
                      <span>{format.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {targets.map((target) => (
                        <Button
                          key={target.key}
                          disabled={format.disabled || isExporting}
                          loading={exportingKey === `${format.key}:${target.key}`}
                          onClick={() => {
                            setDrawerOpen(false);
                            void handleExport(format, target.key);
                          }}
                        >
                          {target.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-100 px-5 pb-8 pt-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-full py-2.5 text-center text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
