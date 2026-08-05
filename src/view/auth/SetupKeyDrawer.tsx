import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Drawer,
  Input,
  Space,
  Steps,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  Banknote,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  KeyRound,
  Landmark,
  ListChecks,
  Lock,
  Server,
  ServerCog,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Unlock,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DEFAULT_SELECTED_MODULES, SETUP_MODULE_GROUPS } from '@/constants/setupModules';
import {
  getLicenseFingerprint,
  getRemoteSetupConfig,
  getSetupConfig,
  saveSetupConfigForRuntime,
  verifyLicenseKey,
} from '@/services/setupKeyService';
import type { PostgresHealth } from '@/services/postgresAdapter';
import { setPostgresConnectionHealth, usePostgresConnectionStore } from '@/store/postgresConnectionStore';
import { isTauriRuntime } from '@/utils/export/platform';
import { HostDatabaseSetup, type HostDatabaseTarget } from '@/view/auth/HostDatabaseSetup';

const { Text, Title, Paragraph } = Typography;

type WizardStep = 0 | 1 | 2 | 3;

interface SetupKeyDrawerProps {
  open: boolean;
  onClose: () => void;
  forceMode?: boolean;
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  Database,
  ShoppingCart,
  FileText,
  ShoppingBag,
  Banknote,
  BarChart3,
  Landmark,
  Store,
};

const WIZARD_BODY_HEIGHT = 'calc(100vh - 182px)';

const SetupHostStep = ({
  hostHealth,
  hostTarget,
  onConfigured,
  onResetHost,
}: {
  hostHealth: PostgresHealth | null;
  hostTarget: HostDatabaseTarget | null;
  onConfigured: (health: PostgresHealth, target: HostDatabaseTarget) => void;
  onResetHost: () => void;
}) => {
  const isConnected = Boolean(hostHealth?.available);

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Host database bersifat opsional"
        description={
          <span className="text-xs">
            Aplikasi berjalan offline-first memakai database lokal, jadi langkah ini boleh dilewati.
            Isi host hanya bila instalasi ini perlu sinkronisasi data antar perangkat. Host tetap bisa
            diatur kapan saja lewat menu <strong>Sync Database</strong>.
          </span>
        }
      />

      {!isTauriRuntime() ? (
        <Alert
          type="warning"
          showIcon
          message="Setup host hanya tersedia di aplikasi desktop"
          description="Build web selalu berjalan lokal. Lanjutkan ke pemilihan module."
        />
      ) : isConnected ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Server size={20} />
            </div>
            <div>
              <Title level={5} className="!mb-0">
                Host database terhubung
              </Title>
              <Text type="secondary" className="text-xs">
                {hostTarget
                  ? `${hostTarget.host}:${hostTarget.port} • ${hostTarget.database}`
                  : 'Koneksi PostgreSQL siap dipakai.'}
              </Text>
            </div>
          </div>
          <Text type="secondary" className="text-xs">
            Konfigurasi setup akan ikut tersimpan di host sehingga perangkat lain memakai module yang sama.
          </Text>
          <Button className="!mt-3" size="small" onClick={onResetHost} icon={<ServerCog size={14} />}>
            Ubah host
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <HostDatabaseSetup embedded health={null} onConfigured={onConfigured} />
        </div>
      )}
    </div>
  );
};

const SetupModuleStep = ({
  allModuleCodes,
  existingConfig,
  selectedModules,
  onDeselectAll,
  onGroupToggle,
  onModuleToggle,
  onSelectAll,
}: {
  allModuleCodes: string[];
  existingConfig: ReturnType<typeof getSetupConfig>;
  selectedModules: string[];
  onDeselectAll: () => void;
  onGroupToggle: (groupKey: string, checked: boolean) => void;
  onModuleToggle: (code: string, checked: boolean) => void;
  onSelectAll: () => void;
}) => {
  const groupCounts = useMemo(() => {
    const counts: Record<string, { total: number; selected: number }> = {};
    SETUP_MODULE_GROUPS.forEach((group) => {
      const total = group.modules.length;
      const selected = group.modules.filter((module) => selectedModules.includes(module.code)).length;
      counts[group.key] = { total, selected };
    });
    return counts;
  }, [selectedModules]);

  const collapseItems = useMemo(() => (
    SETUP_MODULE_GROUPS.map((group) => {
      const IconComponent = GROUP_ICONS[group.iconName] ?? Database;
      const counts = groupCounts[group.key];
      const allSelected = counts.selected === counts.total;
      const someSelected = counts.selected > 0 && !allSelected;

      return {
        key: group.key,
        label: (
          <div className="flex w-full items-center justify-between pr-2">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={{
                  background: allSelected
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : someSelected
                      ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                      : '#e2e8f0',
                }}
              >
                <IconComponent size={14} style={{ color: allSelected || someSelected ? '#fff' : '#64748b' }} />
              </div>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{group.label}</span>
            </div>
            <div className="flex items-center gap-2.5" onClick={(event) => event.stopPropagation()}>
              <Badge
                count={`${counts.selected}/${counts.total}`}
                style={{
                  backgroundColor: allSelected
                    ? '#10b981'
                    : someSelected
                      ? '#3b82f6'
                      : '#cbd5e1',
                  boxShadow: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(event) => onGroupToggle(group.key, event.target.checked)}
              />
            </div>
          </div>
        ),
        children: (
          <div className="grid grid-cols-1 gap-0.5">
            {group.modules.map((module) => {
              const isChecked = selectedModules.includes(module.code);
              return (
                <label
                  key={module.code}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150"
                  style={{
                    backgroundColor: isChecked ? '#f0fdf4' : 'transparent',
                    borderLeft: isChecked ? '3px solid #10b981' : '3px solid transparent',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = isChecked ? '#dcfce7' : '#f1f5f9';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = isChecked ? '#f0fdf4' : 'transparent';
                  }}
                >
                  <Checkbox
                    checked={isChecked}
                    onChange={(event) => onModuleToggle(module.code, event.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      style={{
                        color: isChecked ? '#166534' : '#334155',
                        fontSize: 13,
                        fontWeight: isChecked ? 600 : 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {module.label}
                    </div>
                    {module.description && (
                      <div
                        style={{
                          color: isChecked ? '#16a34a' : '#94a3b8',
                          fontSize: 11,
                          lineHeight: 1.3,
                          marginTop: 1,
                        }}
                      >
                        {module.description}
                      </div>
                    )}
                  </div>
                  {isChecked && <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />}
                </label>
              );
            })}
          </div>
        ),
      };
    })
  ), [groupCounts, onGroupToggle, onModuleToggle, selectedModules]);

  return (
    <>
      <div className="mx-6 mb-3 mt-4 flex items-center justify-between">
        <div>
          <Tag color="success" icon={<Unlock size={12} className="mr-1 inline align-text-bottom" />}>
            License terverifikasi
          </Tag>
          {existingConfig && (
            <Tag color="processing" className="!text-xs">
              Update konfigurasi
            </Tag>
          )}
        </div>
        <Space size={4}>
          <Tooltip title="Pilih semua">
            <Button size="small" type="text" onClick={onSelectAll}>
              All
            </Button>
          </Tooltip>
          <Tooltip title="Hapus semua">
            <Button size="small" type="text" danger onClick={onDeselectAll}>
              None
            </Button>
          </Tooltip>
        </Space>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-2">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <ServerCog size={14} className="text-blue-500" />
            <Text strong className="text-sm">
              Module & Fitur
            </Text>
            <Tag className="!text-xs">
              {selectedModules.length}/{allModuleCodes.length} aktif
            </Tag>
          </div>

          <Collapse
            ghost
            expandIconPosition="start"
            defaultActiveKey={SETUP_MODULE_GROUPS.map((group) => group.key)}
            items={collapseItems}
            className="setup-module-collapse"
          />
        </div>
      </div>
    </>
  );
};

const SetupModuleReviewStep = ({
  hostHealth,
  hostTarget,
  selectedModules,
}: {
  hostHealth: PostgresHealth | null;
  hostTarget: HostDatabaseTarget | null;
  selectedModules: string[];
}) => {
  const isHostConnected = Boolean(hostHealth?.available);
  const moduleLabelsByCode = useMemo(() => (
    new Map(
      SETUP_MODULE_GROUPS.flatMap((group) => (
        group.modules.map((module) => [module.code, module.label] as const)
      )),
    )
  ), []);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <ListChecks size={15} className="text-blue-500" />
          <Text strong>Review Module</Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="Setup akuntansi dipindahkan ke Register Owner"
          description="Developer Setup hanya menentukan module aplikasi. Baseline akun, periode, cutoff, dan base currency akan diisi saat Owner pertama dibuat."
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
          Host database
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isHostConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {isHostConnected ? <Server size={16} /> : <WifiOff size={16} />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">
              {isHostConnected ? 'Terhubung ke host' : 'Dilewati — mode offline (lokal)'}
            </div>
            <div className="text-xs text-slate-500">
              {isHostConnected
                ? hostTarget
                  ? `${hostTarget.host}:${hostTarget.port} • ${hostTarget.database}`
                  : 'Koneksi PostgreSQL aktif.'
                : 'Data tersimpan di perangkat ini. Host bisa diatur nanti lewat menu Sync Database.'}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
          Module aktif
        </div>
        <div className="flex max-h-80 flex-wrap gap-1 overflow-y-auto">
          {selectedModules.map((moduleCode) => (
            <Tag key={moduleCode} color="processing">
              {moduleLabelsByCode.get(moduleCode) ?? moduleCode}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
};

export const SetupKeyDrawer = ({ open, onClose, forceMode = false }: SetupKeyDrawerProps) => {
  const { message } = App.useApp();
  const existingConfig = useMemo(() => getSetupConfig(), []);
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseFingerprint, setLicenseFingerprint] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>(
    existingConfig?.enabledModules ?? DEFAULT_SELECTED_MODULES,
  );
  // Host mungkin sudah dikonfigurasi pada instalasi sebelumnya — pakai status
  // koneksi yang sudah ada supaya step ini langsung tampil sebagai "terhubung".
  const [hostHealth, setHostHealth] = useState<PostgresHealth | null>(
    () => usePostgresConnectionStore.getState().health,
  );
  const [hostTarget, setHostTarget] = useState<HostDatabaseTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isHostConnected = Boolean(hostHealth?.available);

  const allModuleCodes = useMemo(
    () => SETUP_MODULE_GROUPS.flatMap((group) => group.modules.map((module) => module.code)),
    [],
  );

  const handleVerify = useCallback(async () => {
    if (!licenseKey.trim()) {
      message.warning('License key tidak boleh kosong.');
      return;
    }

    setIsVerifying(true);
    try {
      const valid = await verifyLicenseKey(licenseKey);
      if (valid) {
        const fingerprint = await getLicenseFingerprint(licenseKey);
        setLicenseFingerprint(fingerprint);
        setIsVerified(true);
        setCurrentStep(1);
        message.success('License key terverifikasi!');
      } else {
        message.error('License key tidak valid. Periksa kembali.');
      }
    } catch {
      message.error('Gagal memverifikasi license key.');
    } finally {
      setIsVerifying(false);
    }
  }, [licenseKey, message]);

  const handleHostConfigured = useCallback(
    async (nextHealth: PostgresHealth, target: HostDatabaseTarget) => {
      setHostHealth(nextHealth);
      setHostTarget(target);
      // Sinkronkan ke store supaya penyimpanan setup config ikut terdorong ke host.
      setPostgresConnectionHealth(nextHealth);

      try {
        const remoteConfig = await getRemoteSetupConfig();
        if (remoteConfig && remoteConfig.enabledModules.length > 0) {
          setSelectedModules(remoteConfig.enabledModules);
          message.info('Konfigurasi module dari host dimuat otomatis.');
        }
      } catch (error) {
        console.error('Failed to load setup config from host', error);
      }
    },
    [message],
  );

  const handleResetHost = useCallback(() => {
    setHostHealth(null);
    setHostTarget(null);
  }, []);

  const handleModuleToggle = useCallback((code: string, checked: boolean) => {
    setSelectedModules((prev) => (
      checked ? Array.from(new Set([...prev, code])) : prev.filter((item) => item !== code)
    ));
  }, []);

  const handleGroupToggle = useCallback((groupKey: string, checked: boolean) => {
    const group = SETUP_MODULE_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;

    const groupCodes = group.modules.map((module) => module.code);
    setSelectedModules((prev) => {
      const withoutGroup = prev.filter((code) => !groupCodes.includes(code));
      return checked ? Array.from(new Set([...withoutGroup, ...groupCodes])) : withoutGroup;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedModules(allModuleCodes);
  }, [allModuleCodes]);

  const handleDeselectAll = useCallback(() => {
    setSelectedModules([]);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep === 2 && selectedModules.length === 0) {
      message.warning('Pilih minimal satu module.');
      return;
    }

    setCurrentStep((step) => Math.min(step + 1, 3) as WizardStep);
  }, [currentStep, message, selectedModules.length]);

  const handlePrevious = useCallback(() => {
    setCurrentStep((step) => Math.max(step - 1, 0) as WizardStep);
  }, []);

  const handleSave = useCallback(async () => {
    if (selectedModules.length === 0) {
      message.warning('Pilih minimal satu module.');
      return;
    }

    setIsSaving(true);
    try {
      await saveSetupConfigForRuntime({
        enabledModules: selectedModules,
        configuredAt: new Date().toISOString(),
        configuredBy: licenseFingerprint,
      });

      message.success('Konfigurasi module berhasil disimpan!');
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi.');
    } finally {
      setIsSaving(false);
    }
  }, [licenseFingerprint, message, onClose, selectedModules]);

  const handleClose = useCallback(() => {
    if (!isVerified) {
      setLicenseKey('');
    }
    onClose();
  }, [isVerified, onClose]);

  const renderWizardFooter = () => {
    if (currentStep === 0) return null;

    return (
      <div className="border-t border-gray-200 bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>{selectedModules.length} module aktif</span>
          <span>{isHostConnected ? 'Host terhubung' : 'Mode offline (lokal)'}</span>
        </div>
        <div className="flex gap-2">
          <Button
            size="large"
            className="!h-11"
            disabled={currentStep === 1 || isSaving}
            onClick={handlePrevious}
            icon={<ChevronLeft size={16} />}
          >
            Kembali
          </Button>
          {currentStep < 3 ? (
            <Button
              type="primary"
              size="large"
              block
              onClick={handleNext}
              icon={<ChevronRight size={16} />}
              className="!h-11"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                fontWeight: 600,
              }}
            >
              {currentStep === 1 && !isHostConnected ? 'Lewati & Lanjut' : 'Lanjut'}
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              block
              loading={isSaving}
              onClick={handleSave}
              icon={<Check size={16} />}
              className="!h-11"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                fontWeight: 600,
              }}
            >
              Simpan Setup
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={620}
      placement="right"
      closable={!forceMode}
      maskClosable={!forceMode}
      keyboard={!forceMode}
      destroyOnClose={false}
      styles={{
        header: {
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
          padding: '16px 24px',
        },
        body: {
          background: '#fafbfc',
          padding: 0,
        },
      }}
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/25">
            <Settings2 size={18} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-white">
              Developer Setup
            </div>
            <div className="text-xs font-normal text-blue-300/80">
              Konfigurasi module instalasi sistem
            </div>
          </div>
        </div>
      }
    >
      <div className="px-6 pb-3 pt-5">
        <Steps
          current={currentStep}
          size="small"
          items={[
            {
              title: 'License',
              icon: currentStep > 0 ? <Check size={14} /> : <KeyRound size={14} />,
            },
            {
              title: 'Host',
              subTitle: 'opsional',
              icon: isHostConnected ? <Server size={14} /> : <WifiOff size={14} />,
            },
            {
              title: 'Module',
              icon: <ServerCog size={14} />,
            },
            {
              title: 'Review',
              icon: <ListChecks size={14} />,
            },
          ]}
        />
      </div>

      <Divider className="!my-0" />

      {currentStep === 0 && (
        <div className="px-6 py-5">
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Lock size={20} />
              </div>
              <div>
                <Title level={5} className="!mb-0">
                  Verifikasi License Key
                </Title>
                <Text type="secondary" className="text-xs">
                  Masukkan license key dari developer
                </Text>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">
                  License Key
                </label>
                <Input.Password
                  size="large"
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                  placeholder="Masukkan license key..."
                  prefix={<KeyRound size={16} className="text-gray-400" />}
                  onPressEnter={handleVerify}
                  autoFocus
                />
              </div>

              <Button
                type="primary"
                size="large"
                block
                loading={isVerifying}
                onClick={handleVerify}
                icon={<ShieldCheck size={16} />}
                className="!h-11"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  fontWeight: 600,
                }}
              >
                Verifikasi License
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <Paragraph className="!mb-0 text-xs text-gray-500">
              <KeyRound size={12} className="mr-1 inline align-text-bottom" />
              License key diperlukan untuk mengakses konfigurasi setup. Hubungi developer
              jika belum memiliki license key.
            </Paragraph>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="flex flex-col" style={{ height: WIZARD_BODY_HEIGHT }}>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <SetupHostStep
              hostHealth={hostHealth}
              hostTarget={hostTarget}
              onConfigured={handleHostConfigured}
              onResetHost={handleResetHost}
            />
          </div>
          {renderWizardFooter()}
        </div>
      )}

      {currentStep === 2 && (
        <div className="flex flex-col" style={{ height: WIZARD_BODY_HEIGHT }}>
          <SetupModuleStep
            allModuleCodes={allModuleCodes}
            existingConfig={existingConfig}
            selectedModules={selectedModules}
            onDeselectAll={handleDeselectAll}
            onGroupToggle={handleGroupToggle}
            onModuleToggle={handleModuleToggle}
            onSelectAll={handleSelectAll}
          />
          {renderWizardFooter()}
        </div>
      )}

      {currentStep === 3 && (
        <div className="flex flex-col" style={{ height: WIZARD_BODY_HEIGHT }}>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <SetupModuleReviewStep
              hostHealth={hostHealth}
              hostTarget={hostTarget}
              selectedModules={selectedModules}
            />
          </div>
          {renderWizardFooter()}
        </div>
      )}
    </Drawer>
  );
};
