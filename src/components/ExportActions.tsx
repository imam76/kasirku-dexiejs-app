import { CloseOutlined, DownOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Grid } from 'antd';
import type { ButtonProps, MenuProps } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import type { ExportTarget } from '@/utils/export';

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

const { useBreakpoint } = Grid;

const DEFAULT_TARGETS: ExportTargetAction[] = [
  { key: 'share', label: 'Bagikan' },
  { key: 'save', label: 'Simpan ke File' },
];

export default function ExportActions({
  formats,
  disabled = false,
  buttonClassName,
  buttonType = 'primary',
  label = 'Export',
}: ExportActionsProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const isDisabled = disabled || formats.length === 0 || formats.every((format) => format.disabled);

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      formats.map((format) => ({
        key: format.key,
        label: format.label,
        icon: format.icon,
        disabled: format.disabled,
        children: (format.targets ?? DEFAULT_TARGETS).map((target) => ({
          key: `${format.key}:${target.key}`,
          label: target.label,
        })),
      })),
    [formats],
  );

  const handleMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    const [formatKey, targetKey] = String(key).split(':');
    const format = formats.find((item) => item.key === formatKey);
    if (!format || format.disabled) return;

    void format.onExport((targetKey || 'auto') as ExportTarget);
  };

  const button = (
    <Button
      type={buttonType}
      className={buttonClassName}
      icon={<DownloadOutlined className="text-[12px]" />}
      disabled={isDisabled}
      onClick={isMobile ? () => setDrawerOpen(true) : undefined}
    >
      {label}
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
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-800">Export</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="Tutup pilihan export"
              >
                <CloseOutlined className="text-[16px]" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {formats.map((format) => {
                const targets = format.targets ?? DEFAULT_TARGETS;

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
                          disabled={format.disabled}
                          onClick={() => {
                            setDrawerOpen(false);
                            void format.onExport(target.key);
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
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
