import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Typography } from 'antd';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { createOwnerUser, normalizeAuthEmail } from '@/auth/authService';
import { useAuth } from '@/auth/useAuth';
import { DEFAULT_SELECTED_MODULES } from '@/constants/setupModules';
import { db } from '@/lib/db';
import { getBaseCurrencyLockSignals } from '@/services/baseCurrencyService';
import {
  getSuggestedAccountingBusinessTemplate,
  requiresAccountingBaselineForModules,
  saveInitialAccountingSetup,
} from '@/services/accountingInitialSetupService';
import { getSetupConfig } from '@/services/setupKeyService';
import type { AccountingBusinessTemplateCode, AccountingInitialSetupSetting } from '@/types';
import { OwnerAccountingSetup } from './OwnerAccountingSetup';
import {
  createDefaultAccountingDraft,
  getFirstValidationError,
  normalizeCurrencyCode,
  validateAccountingDraft,
  type AccountingDraft,
  type AccountingValidationErrors,
} from './ownerAccountingSetupModel';

const { Text } = Typography;

interface SetupOwnerFormValues {
  name: string;
  email: string;
  pin: string;
  confirmPin: string;
}

interface SetupOwnerProps {
  onComplete?: () => void;
  onBackToLogin?: () => void;
}

export const SetupOwner = ({ onBackToLogin, onComplete }: SetupOwnerProps) => {
  const { message } = App.useApp();
  const { login } = useAuth();
  const [form] = Form.useForm<SetupOwnerFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setupConfig = useMemo(() => getSetupConfig(), []);
  const enabledModules = useMemo(
    () => setupConfig?.enabledModules ?? DEFAULT_SELECTED_MODULES,
    [setupConfig],
  );
  const defaultAccountingDraft = useMemo(() => ({
    ...createDefaultAccountingDraft(),
    businessTemplateCode: getSuggestedAccountingBusinessTemplate(enabledModules),
  }), [enabledModules]);
  const [accountingDraft, setAccountingDraft] = useState<AccountingDraft>(defaultAccountingDraft);
  const [accountingErrors, setAccountingErrors] = useState<AccountingValidationErrors>({});
  const [hasTouchedBusinessTemplate, setHasTouchedBusinessTemplate] = useState(false);
  const [hasOperationalSignal, setHasOperationalSignal] = useState(false);
  const [existingAccountingSetup, setExistingAccountingSetup] =
    useState<AccountingInitialSetupSetting | null>(null);

  const requiresAccountingBaseline = useMemo(
    () => requiresAccountingBaselineForModules(enabledModules),
    [enabledModules],
  );

  useEffect(() => {
    let cancelled = false;

    const loadAccountingState = async () => {
      const [setup, lockSignals] = await Promise.all([
        db.accountingInitialSetupSetting.get('default'),
        getBaseCurrencyLockSignals(),
      ]);

      if (cancelled) return;

      setExistingAccountingSetup(setup ?? null);
      setHasOperationalSignal(lockSignals.hasSignal);

      if (setup) {
        setAccountingDraft({
          businessTemplateCode: setup.business_template_code,
          cutoffDate: setup.cutoff_date,
          fiscalPeriodStart: setup.fiscal_period_start,
          fiscalPeriodEnd: setup.fiscal_period_end,
          currentPeriodStart: setup.current_period_start,
          currentPeriodEnd: setup.current_period_end,
          baseCurrencyCode: setup.base_currency_code,
        });
      }
    };

    void loadAccountingState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasTouchedBusinessTemplate || existingAccountingSetup) return;
    setAccountingDraft((current) => ({
      ...current,
      businessTemplateCode: getSuggestedAccountingBusinessTemplate(enabledModules),
    }));
  }, [enabledModules, existingAccountingSetup, hasTouchedBusinessTemplate]);

  const updateAccountingDraft = useCallback((patch: Partial<AccountingDraft>) => {
    setAccountingDraft((current) => ({
      ...current,
      ...patch,
      baseCurrencyCode: patch.baseCurrencyCode !== undefined
        ? normalizeCurrencyCode(patch.baseCurrencyCode)
        : current.baseCurrencyCode,
    }));
    setAccountingErrors({});
  }, []);

  const handleSelectBusinessTemplate = useCallback((code: AccountingBusinessTemplateCode) => {
    setHasTouchedBusinessTemplate(true);
    updateAccountingDraft({ businessTemplateCode: code });
  }, [updateAccountingDraft]);

  const handleSubmit = async (values: SetupOwnerFormValues) => {
    if (isSubmitting) return;

    if (values.pin !== values.confirmPin) {
      message.error('Konfirmasi PIN tidak sama.');
      return;
    }

    const errors = validateAccountingDraft(
      accountingDraft,
      requiresAccountingBaseline,
      hasOperationalSignal,
      existingAccountingSetup?.base_currency_code,
    );
    setAccountingErrors(errors);
    const firstAccountingError = getFirstValidationError(errors);
    if (firstAccountingError) {
      message.warning(firstAccountingError);
      return;
    }

    setIsSubmitting(true);
    try {
      const email = normalizeAuthEmail(values.email) ?? '';
      const ownerName = values.name.trim();
      const ownerId = crypto.randomUUID();
      await saveInitialAccountingSetup({
        enabledModules,
        configuredBy: ownerId,
        configuredByName: ownerName,
        business_template_code: accountingDraft.businessTemplateCode,
        cutoff_date: accountingDraft.cutoffDate,
        fiscal_period_start: accountingDraft.fiscalPeriodStart,
        fiscal_period_end: accountingDraft.fiscalPeriodEnd,
        current_period_start: accountingDraft.currentPeriodStart,
        current_period_end: accountingDraft.currentPeriodEnd,
        base_currency_code: accountingDraft.baseCurrencyCode,
        persistSetupConfig: false,
      });
      await createOwnerUser({
        id: ownerId,
        name: ownerName,
        email,
        pin: values.pin,
      });
      await login(email, values.pin);
      message.success('Owner dan setup akuntansi berhasil dibuat.');
      onComplete?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuat Owner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Register Owner</h1>
          <Text type="secondary">Buat akses utama untuk toko ini.</Text>
        </div>
      </div>

      <Form<SetupOwnerFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Form.Item
          label="Nama Owner"
          name="name"
          rules={[
            { required: true, message: 'Nama Owner wajib diisi.' },
            { min: 2, message: 'Nama minimal 2 karakter.' },
          ]}
        >
          <Input size="large" autoFocus placeholder="Contoh: Imam" disabled={isSubmitting} />
        </Form.Item>

        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Email wajib diisi.' },
            { type: 'email', message: 'Format email tidak valid.' },
          ]}
        >
          <Input size="large" placeholder="Contoh: owner@toko.com" disabled={isSubmitting} />
        </Form.Item>

        <Form.Item
          label="PIN"
          name="pin"
          rules={[
            { required: true, message: 'PIN wajib diisi.' },
            { min: 4, message: 'PIN minimal 4 digit.' },
            { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
          ]}
        >
          <Input.Password size="large" inputMode="numeric" placeholder="Masukkan PIN" disabled={isSubmitting} />
        </Form.Item>

        <Form.Item
          label="Konfirmasi PIN"
          name="confirmPin"
          rules={[
            { required: true, message: 'Konfirmasi PIN wajib diisi.' },
            { min: 4, message: 'PIN minimal 4 digit.' },
            { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
          ]}
        >
          <Input.Password size="large" inputMode="numeric" placeholder="Ulangi PIN" disabled={isSubmitting} />
        </Form.Item>

        <OwnerAccountingSetup
          draft={accountingDraft}
          errors={accountingErrors}
          existingAccountingSetup={existingAccountingSetup}
          hasOperationalSignal={hasOperationalSignal}
          moduleCount={enabledModules.length}
          onChange={updateAccountingDraft}
          onSelectBusinessTemplate={handleSelectBusinessTemplate}
          requiresAccountingBaseline={requiresAccountingBaseline}
        />

        <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting}>
          {isSubmitting ? 'Menyimpan...' : 'Simpan Owner'}
        </Button>

        {onBackToLogin && (
          <Button
            type="link"
            icon={<ArrowLeft size={16} />}
            onClick={onBackToLogin}
            disabled={isSubmitting}
            block
          >
            Kembali ke Login
          </Button>
        )}
      </Form>
    </div>
  );
};
