import { useState, useMemo, useCallback } from 'react';
import {
  Drawer,
  Button,
  Input,
  Checkbox,
  Collapse,
  Steps,
  Typography,
  Space,
  Divider,
  Tag,
  Badge,
  App,
  Tooltip,
} from 'antd';
import {
  KeyRound,
  ShieldCheck,
  Database,
  ShoppingCart,
  FileText,
  ShoppingBag,
  Banknote,
  BarChart3,
  Landmark,
  Check,
  ChevronRight,
  Settings2,
  Lock,
  Unlock,
  ServerCog,
  Fingerprint,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { LucideIcon } from 'lucide-react';
import { ensureDefaultOwner } from '@/auth/authService';
import { SETUP_MODULE_GROUPS, DEFAULT_SELECTED_MODULES } from '@/constants/setupModules';
import { isTauriRuntime } from '@/utils/export/platform';
import {
  verifyLicenseKey,
  getLicenseFingerprint,
  saveSetupConfig,
  getSetupConfig,
} from '@/services/setupKeyService';
import type { PostgresHealth } from '@/services/postgresAdapter';

const { Text, Title, Paragraph } = Typography;

// Icon mapping for module groups
const GROUP_ICONS: Record<string, LucideIcon> = {
  Database,
  ShoppingCart,
  FileText,
  ShoppingBag,
  Banknote,
  BarChart3,
  Landmark,
};

interface DatabaseParts {
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
}

const EMPTY_DB_PARTS: DatabaseParts = {
  host: '',
  port: '',
  name: '',
  user: '',
  password: '',
};

// The backend still expects a full connection URL, but typing it by hand is
// error-prone. We let the user fill short labelled fields and (de)serialize
// the `postgresql://user:pass@host:port/db` string here.
const parseDatabaseUrl = (url: string | undefined): DatabaseParts => {
  if (!url?.trim()) return { ...EMPTY_DB_PARTS };
  try {
    const parsed = new URL(url.trim());
    return {
      host: parsed.hostname,
      port: parsed.port,
      name: parsed.pathname.replace(/^\//, ''),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return { ...EMPTY_DB_PARTS };
  }
};

const buildDatabaseUrl = (parts: DatabaseParts): string => {
  const host = parts.host.trim();
  if (!host) return ''; // empty host = offline-only (Dexie) mode

  const port = parts.port.trim() || '5432';
  const name = parts.name.trim() || 'postgres';
  const user = parts.user.trim();
  const auth = user
    ? `${encodeURIComponent(user)}${parts.password ? `:${encodeURIComponent(parts.password)}` : ''}@`
    : '';

  return `postgresql://${auth}${host}:${port}/${name}`;
};

interface SetupKeyDrawerProps {
  open: boolean;
  onClose: () => void;
  forceMode?: boolean;
}

export const SetupKeyDrawer = ({ open, onClose, forceMode = false }: SetupKeyDrawerProps) => {
  const { message } = App.useApp();

  // Step state
  const [currentStep, setCurrentStep] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseFingerprint, setLicenseFingerprint] = useState('');

  // Config state
  const existingConfig = useMemo(() => getSetupConfig(), []);
  const [selectedModules, setSelectedModules] = useState<string[]>(
    existingConfig?.enabledModules ?? DEFAULT_SELECTED_MODULES,
  );
  const [dbParts, setDbParts] = useState<DatabaseParts>(
    () => parseDatabaseUrl(existingConfig?.databaseUrl),
  );
  const updateDbPart = useCallback(
    (key: keyof DatabaseParts, value: string) =>
      setDbParts((prev) => ({ ...prev, [key]: value })),
    [],
  );
  const [isSaving, setIsSaving] = useState(false);

  // All module codes flat list
  const allModuleCodes = useMemo(
    () => SETUP_MODULE_GROUPS.flatMap((group) => group.modules.map((m) => m.code)),
    [],
  );

  // Module counts per group
  const groupCounts = useMemo(() => {
    const counts: Record<string, { total: number; selected: number }> = {};
    SETUP_MODULE_GROUPS.forEach((group) => {
      const total = group.modules.length;
      const selected = group.modules.filter((m) => selectedModules.includes(m.code)).length;
      counts[group.key] = { total, selected };
    });
    return counts;
  }, [selectedModules]);

  // Handle license verification
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

  // Toggle module
  const handleModuleToggle = useCallback((code: string, checked: boolean) => {
    setSelectedModules((prev) =>
      checked ? [...prev, code] : prev.filter((c) => c !== code),
    );
  }, []);

  // Toggle entire group
  const handleGroupToggle = useCallback(
    (groupKey: string, checked: boolean) => {
      const group = SETUP_MODULE_GROUPS.find((g) => g.key === groupKey);
      if (!group) return;
      const groupCodes = group.modules.map((m) => m.code);
      setSelectedModules((prev) => {
        const withoutGroup = prev.filter((c) => !groupCodes.includes(c));
        return checked ? [...withoutGroup, ...groupCodes] : withoutGroup;
      });
    },
    [],
  );

  // Select / deselect all
  const handleSelectAll = useCallback(() => {
    setSelectedModules(allModuleCodes);
  }, [allModuleCodes]);

  const handleDeselectAll = useCallback(() => {
    setSelectedModules([]);
  }, []);

  // Save configuration
  const handleSave = useCallback(async () => {
    if (selectedModules.length === 0) {
      message.warning('Pilih minimal satu module.');
      return;
    }

    setIsSaving(true);
    try {
      const normalizedDatabaseUrl = buildDatabaseUrl(dbParts);

      // Persist & re-init the Postgres pool from the URL the user pasted.
      // Run this first: if it fails we don't want to claim the setup succeeded.
      if (isTauriRuntime()) {
        const postgresHealth = await invoke<PostgresHealth>('set_postgres_database_url', {
          databaseUrl: normalizedDatabaseUrl,
        });
        if (normalizedDatabaseUrl && !postgresHealth.available) {
          throw new Error(postgresHealth.message ?? 'Koneksi PostgreSQL tidak tersedia.');
        }
      }

      saveSetupConfig({
        enabledModules: selectedModules,
        databaseUrl: normalizedDatabaseUrl,
        configuredAt: new Date().toISOString(),
        configuredBy: licenseFingerprint,
      });

      await ensureDefaultOwner();

      message.success('Konfigurasi setup berhasil disimpan!');
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedModules, dbParts, licenseFingerprint, message, onClose]);

  // Reset drawer state when closed
  const handleClose = useCallback(() => {
    if (!isVerified) {
      setLicenseKey('');
    }
    onClose();
  }, [isVerified, onClose]);

  // Build collapse items
  const collapseItems = SETUP_MODULE_GROUPS.map((group) => {
    const IconComponent = GROUP_ICONS[group.iconName] ?? Database;
    const counts = groupCounts[group.key];
    const allSelected = counts.selected === counts.total;
    const someSelected = counts.selected > 0 && !allSelected;

    return {
      key: group.key,
      label: (
        <div className="flex items-center justify-between w-full pr-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
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
          <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
            <Badge
              count={`${counts.selected}/${counts.total}`}
              style={{
                backgroundColor: allSelected
                  ? '#10b981'
                  : someSelected
                    ? '#3b82f6'
                    : '#cbd5e1',
                fontSize: 11,
                fontWeight: 700,
                boxShadow: 'none',
              }}
            />
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={(e) => handleGroupToggle(group.key, e.target.checked)}
            />
          </div>
        </div>
      ),
      children: (
        <div className="grid grid-cols-1 gap-0.5">
          {group.modules.map((mod) => {
            const isChecked = selectedModules.includes(mod.code);
            return (
              <label
                key={mod.code}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150"
                style={{
                  backgroundColor: isChecked ? '#f0fdf4' : 'transparent',
                  borderLeft: isChecked ? '3px solid #10b981' : '3px solid transparent',
                  ...(isChecked ? {} : {}),
                }}
                onMouseEnter={(e) => {
                  if (!isChecked) {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                  } else {
                    e.currentTarget.style.backgroundColor = '#dcfce7';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isChecked ? '#f0fdf4' : 'transparent';
                }}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={(e) => handleModuleToggle(mod.code, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isChecked ? 600 : 500,
                      color: isChecked ? '#166534' : '#334155',
                      lineHeight: 1.4,
                    }}
                  >
                    {mod.label}
                  </div>
                  {mod.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: isChecked ? '#16a34a' : '#94a3b8',
                        marginTop: 1,
                        lineHeight: 1.3,
                      }}
                    >
                      {mod.description}
                    </div>
                  )}
                </div>
                {isChecked && (
                  <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                )}
              </label>
            );
          })}
        </div>
      ),
    };
  });

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={540}
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
          padding: 0,
          background: '#fafbfc',
        },
      }}
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/25">
            <Settings2 size={18} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-white leading-tight">
              Developer Setup
            </div>
            <div className="text-xs text-blue-300/80 font-normal">
              Konfigurasi awal instalasi sistem
            </div>
          </div>
        </div>
      }
    >
      {/* Stepper */}
      <div className="px-6 pt-5 pb-3">
        <Steps
          current={currentStep}
          size="small"
          items={[
            {
              title: 'License',
              icon: currentStep > 0 ? <Check size={14} /> : <KeyRound size={14} />,
            },
            {
              title: 'Konfigurasi',
              icon: <ServerCog size={14} />,
            },
          ]}
        />
      </div>

      <Divider className="!my-0" />

      {/* Step 1: License Verification */}
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
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  License Key
                </label>
                <Input.Password
                  size="large"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
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
              <Fingerprint size={12} className="mr-1 inline align-text-bottom" />
              License key diperlukan untuk mengakses konfigurasi setup. Hubungi developer
              jika belum memiliki license key.
            </Paragraph>
          </div>
        </div>
      )}

      {/* Step 2: Module Selection + DB Config */}
      {currentStep === 1 && (
        <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
          {/* Verified badge */}
          <div className="mx-6 mt-4 mb-3 flex items-center justify-between">
            <Tag
              color="success"
              icon={<Unlock size={12} className="mr-1 inline align-text-bottom" />}
              className="!text-xs !font-semibold"
            >
              Terverifikasi • {licenseFingerprint}
            </Tag>
            <Space size={4}>
              <Tooltip title="Pilih semua">
                <Button size="small" type="text" onClick={handleSelectAll}>
                  All
                </Button>
              </Tooltip>
              <Tooltip title="Hapus semua">
                <Button size="small" type="text" danger onClick={handleDeselectAll}>
                  None
                </Button>
              </Tooltip>
            </Space>
          </div>

          {/* Scrollable module list */}
          <div className="flex-1 overflow-y-auto px-6 pb-2">
            {/* Module Groups */}
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <ChevronRight size={14} className="text-blue-500" />
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
                defaultActiveKey={SETUP_MODULE_GROUPS.map((g) => g.key)}
                items={collapseItems}
                className="setup-module-collapse"
              />
            </div>

            <Divider />

            {/* Database connection */}
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Database size={14} className="text-blue-500" />
                <Text strong className="text-sm">
                  Koneksi Database
                </Text>
              </div>

              <div className="space-y-2.5">
                {/* Host / IP */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Host / IP
                  </label>
                  <Input
                    size="large"
                    value={dbParts.host}
                    onChange={(e) => updateDbPart('host', e.target.value)}
                    placeholder="192.168.1.8 atau db.contoh.com"
                    prefix={<ServerCog size={14} className="text-gray-400" />}
                  />
                </div>

                {/* Port + Database */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Port
                    </label>
                    <Input
                      size="large"
                      value={dbParts.port}
                      onChange={(e) => updateDbPart('port', e.target.value)}
                      placeholder="5432"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Nama Database
                    </label>
                    <Input
                      size="large"
                      value={dbParts.name}
                      onChange={(e) => updateDbPart('name', e.target.value)}
                      placeholder="postgres"
                    />
                  </div>
                </div>

                {/* User + Password */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      User
                    </label>
                    <Input
                      size="large"
                      value={dbParts.user}
                      onChange={(e) => updateDbPart('user', e.target.value)}
                      placeholder="postgres"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Password
                    </label>
                    <Input.Password
                      size="large"
                      value={dbParts.password}
                      onChange={(e) => updateDbPart('password', e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <Text type="secondary" className="mt-2 block text-xs">
                Cukup isi Host/IP dan kredensialnya — Port default <Text code className="!text-xs">5432</Text>.
                Kosongkan Host jika hanya memakai mode offline (Dexie).
              </Text>
            </div>
          </div>

          {/* Fixed bottom action */}
          <div className="border-t border-gray-200 bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span>{selectedModules.length} module aktif</span>
              {existingConfig && (
                <Tag color="processing" className="!text-xs">
                  Update konfigurasi
                </Tag>
              )}
            </div>
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
                fontWeight: 600,
                border: 'none',
              }}
            >
              Simpan Konfigurasi
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};
