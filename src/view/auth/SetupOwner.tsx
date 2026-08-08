import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Steps, Typography } from 'antd';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { createOwnerUser, normalizeAuthEmail } from '@/auth/authService';
import { useAuth } from '@/auth/useAuth';
import { AUTH_PIN_LENGTH, AUTH_PIN_VALIDATION_MESSAGE } from '@/auth/pinPolicy';
import { DEFAULT_SELECTED_MODULES } from '@/constants/setupModules';
import { db } from '@/lib/db';
import { getBaseCurrencyLockSignals } from '@/services/baseCurrencyService';
import {
  getSuggestedAccountingBusinessTemplate,
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
  const [currentStep, setCurrentStep] = useState(0);
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

  const goToOwnerStep = useCallback(() => {
    setCurrentStep(0);
  }, []);

  const goToBusinessStep = useCallback(async () => {
    try {
      await form.validateFields(['name', 'email', 'pin', 'confirmPin']);
      setCurrentStep(1);
    } catch {
      // Ant Design menampilkan pesan validasi pada kolom terkait.
    }
  }, [form]);

  const handleSubmit = async (values: SetupOwnerFormValues) => {
    if (isSubmitting) return;

    if (values.pin !== values.confirmPin) {
      message.error('Konfirmasi PIN tidak sama.');
      return;
    }

    const errors = validateAccountingDraft(
      accountingDraft,
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
      message.success('Owner dan pengaturan usaha berhasil dibuat.');
      onComplete?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuat Owner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormFinish = () => {
    if (currentStep === 0) {
      setCurrentStep(1);
      return;
    }

    void handleSubmit(form.getFieldsValue(true));
  };

  return (
    <div className="h-[100dvh] overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-16">
        <div className="mb-9 sm:mb-11">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ShieldCheck size={24} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-gray-900">Daftarkan Owner</h1>
          <Text type="secondary" className="mt-2 block max-w-lg text-sm leading-relaxed">
            Akun Owner memegang akses utama aplikasi dan menentukan dasar pencatatan usaha.
          </Text>
        </div>

        <Steps
          current={currentStep}
          responsive={false}
          size="small"
          className="mb-7 [&_.ant-steps-item-process_.ant-steps-item-icon]:!border-blue-600 [&_.ant-steps-item-process_.ant-steps-item-icon]:!bg-blue-600 [&_.ant-steps-item-process_.ant-steps-item-icon]:!text-white"
          items={[
            { title: 'Akun Owner' },
            { title: 'Pengaturan Usaha' },
          ]}
        />

        <Form<SetupOwnerFormValues>
          form={form}
          layout="vertical"
          onFinish={handleFormFinish}
          requiredMark={false}
          scrollToFirstError
        >
          <div className="w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            {currentStep === 0 ? (
              <>
                <Form.Item
                  label="Nama Owner"
                  name="name"
                  className="!mb-6"
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
                  className="!mb-8"
                  rules={[
                    { required: true, message: 'Email wajib diisi.' },
                    { type: 'email', message: 'Masukkan alamat email yang valid.' },
                  ]}
                >
                  <Input size="large" placeholder="Contoh: owner@toko.com" disabled={isSubmitting} />
                </Form.Item>

                <div className="mb-4 border-t border-gray-100 pt-6">
                  <Text strong className="block text-sm">PIN Masuk</Text>
                  <Text type="secondary" className="mt-1.5 block text-xs leading-relaxed">
                    {AUTH_PIN_LENGTH} digit angka, dipakai setiap kali masuk aplikasi.
                  </Text>
                </div>

                <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                  <Form.Item
                    label="PIN"
                    name="pin"
                    className="!mb-6 sm:!mb-0"
                    rules={[
                      { required: true, message: 'PIN wajib diisi.' },
                      { len: AUTH_PIN_LENGTH, message: AUTH_PIN_VALIDATION_MESSAGE },
                      { pattern: /^\d+$/, message: AUTH_PIN_VALIDATION_MESSAGE },
                    ]}
                  >
                    <Input.Password
                      size="large"
                      inputMode="numeric"
                      maxLength={AUTH_PIN_LENGTH}
                      placeholder={`${AUTH_PIN_LENGTH} digit angka`}
                      disabled={isSubmitting}
                    />
                  </Form.Item>

                  <Form.Item
                    label="Konfirmasi PIN"
                    name="confirmPin"
                    className="!mb-0"
                    dependencies={['pin']}
                    rules={[
                      { required: true, message: 'Konfirmasi PIN wajib diisi.' },
                      { len: AUTH_PIN_LENGTH, message: AUTH_PIN_VALIDATION_MESSAGE },
                      { pattern: /^\d+$/, message: AUTH_PIN_VALIDATION_MESSAGE },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('pin') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('Konfirmasi PIN tidak sama.'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password
                      size="large"
                      inputMode="numeric"
                      maxLength={AUTH_PIN_LENGTH}
                      placeholder="Ulangi PIN"
                      disabled={isSubmitting}
                    />
                  </Form.Item>
                </div>
              </>
            ) : (
              <OwnerAccountingSetup
                disabled={isSubmitting}
                draft={accountingDraft}
                errors={accountingErrors}
                existingAccountingSetup={existingAccountingSetup}
                hasOperationalSignal={hasOperationalSignal}
                onChange={updateAccountingDraft}
                onSelectBusinessTemplate={handleSelectBusinessTemplate}
              />
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {currentStep === 0 ? (
              <>
                {onBackToLogin ? (
                  <Button
                    size="large"
                    icon={<ArrowLeft size={16} />}
                    onClick={onBackToLogin}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto"
                  >
                    Kembali ke Login
                  </Button>
                ) : <span />}
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRight size={16} />}
                  iconPlacement="end"
                  onClick={() => void goToBusinessStep()}
                  className="w-full sm:w-auto sm:min-w-56"
                >
                  Lanjut ke Pengaturan Usaha
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="large"
                  icon={<ArrowLeft size={16} />}
                  onClick={goToOwnerStep}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Kembali
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  icon={<Check size={16} />}
                  loading={isSubmitting}
                  className="w-full sm:w-auto sm:min-w-44"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Buat Owner'}
                </Button>
              </>
            )}
          </div>
        </Form>
      </div>
    </div>
  );
};
