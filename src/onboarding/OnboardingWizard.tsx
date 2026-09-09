import { useState } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select } from 'antd';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import {
  BASE_MODULES,
  getPlan,
  getPlanModules,
  PLAN_CATALOG,
  PLAN_NAMES,
  type PlanId,
} from './catalog';
import { registrationSchema, type Registration } from './contract';
import { createTrial, writeSubscription } from './storage';
import {
  applySubscriptionModules,
  recoverSubscription,
  syncBilling,
} from './billingClient';
import { TERMS_TEXT, PRIVACY_TEXT } from './legal';
import { moduleName, rupiah } from './presentation';
import { db } from '@/lib/db';
import {
  getSuggestedAccountingBusinessTemplate,
  saveInitialAccountingSetup,
} from '@/services/accountingInitialSetupService';
import {
  createDefaultAccountingDraft,
  validateAccountingDraft,
  type AccountingDraft,
} from '@/view/auth/ownerAccountingSetupModel';
import { OwnerAccountingSetup } from '@/view/auth/OwnerAccountingSetup';
import './onboarding.css';

export function PlanPicker({
  plan,
  onChange,
  modules,
  onModules,
  disabled = false,
}: {
  plan: PlanId;
  onChange: (plan: PlanId) => void;
  modules: string[];
  onModules: (modules: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div
        className="onboarding-plans"
        role="radiogroup"
        aria-label="Paket usaha"
      >
        {PLAN_CATALOG.map((item) => (
          <button
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={plan === item.id}
            className={`onboarding-plan ${plan === item.id ? 'selected' : ''}`}
            key={item.id}
            onClick={() => onChange(item.id)}
          >
            <span className="onboarding-plan-title">
              {PLAN_NAMES[item.id]} {plan === item.id && <Check size={18} />}
            </span>
            <strong>
              {rupiah(item.monthlyPrice)}
              <small> / bulan</small>
            </strong>
            <span>
              {item.id === 'custom'
                ? 'Pilih modul sesuai kebutuhan usaha Anda.'
                : item.id === 'pos'
                  ? 'Kasir, restoran, stok, dan laporan usaha.'
                  : item.id === 'trading'
                    ? 'POS, penjualan, pembelian, utang dan piutang.'
                    : item.id === 'production'
                      ? 'Perdagangan dan proses produksi.'
                      : 'Anggota, simpan pinjam, penagihan dan SHU.'}
            </span>
            {item.setupPrice > 0 && (
              <small>Setup sekali {rupiah(item.setupPrice)}</small>
            )}
          </button>
        ))}
      </div>
      <p className="onboarding-muted">
        Harga per badan usaha, belum termasuk pajak yang wajib dipungut.
        Pembayaran manual bulanan.
      </p>
      {plan === 'custom' && (
        <Form.Item label="Modul Custom" required>
          <Select
            disabled={disabled}
            mode="multiple"
            aria-label="Modul Custom"
            value={modules}
            onChange={onModules}
            optionFilterProp="label"
            options={getPlan('custom')
              .modules.filter((code) => !BASE_MODULES.includes(code))
              .map((code) => ({ value: code, label: moduleName(code) }))}
          />
          <p className="onboarding-muted">
            Role & izin, Cash & Bank, dan daftar akun selalu tersedia. Custom
            mencakup konfigurasi modul, bukan fitur baru.
          </p>
        </Form.Item>
      )}
      <details className="onboarding-details">
        <summary>Modul dalam paket {PLAN_NAMES[plan]}</summary>
        <ul>
          {getPlanModules(plan, modules).map((code) => (
            <li key={code}>{moduleName(code)}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
const emptyRegistration: Registration = {
  owner: '',
  business: '',
  whatsapp: '',
  businessType: '',
  email: '',
  location: '',
};
const DRAFT_KEY = 'frayukti-onboarding-draft-v1';
function readDraft(): Registration {
  try {
    return registrationSchema.parse(
      JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}'),
    );
  } catch {
    return emptyRegistration;
  }
}
export function OnboardingWizard({ onJoinHost }: { onJoinHost?: () => void }) {
  const { message } = App.useApp();
  const [screen, setScreen] = useState<'welcome' | 'wizard' | 'recovery'>(
    'welcome',
  );
  const [step, setStep] = useState(0);
  const [registration, setRegistration] = useState<Registration>(readDraft);
  const [plan, setPlan] = useState<PlanId>('pos');
  const [modules, setModules] = useState<string[]>([]);
  const [accounting, setAccounting] = useState<AccountingDraft>(
    createDefaultAccountingDraft,
  );
  const [configureAccounting, setConfigureAccounting] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [document, setDocument] = useState<'terms' | 'privacy' | null>(null);
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm<Registration>();
  const steps = [
    'Registrasi usaha',
    'Pilih paket',
    'Setup akuntansi',
    'Syarat & privasi',
  ];
  async function next() {
    setError('');
    if (step === 0) {
      try {
        const values = registrationSchema.parse(await form.validateFields());
        setRegistration(values);
        localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      } catch {
        setError(
          'Lengkapi nama, usaha, WhatsApp, dan jenis usaha dengan benar.',
        );
        return;
      }
    }
    if (step === 1 && plan === 'custom' && !modules.length) {
      setError('Pilih minimal satu modul Custom.');
      return;
    }
    if (
      step === 2 &&
      configureAccounting &&
      Object.keys(validateAccountingDraft(accounting, false)).length
    ) {
      setError('Periksa kembali periode dan konfigurasi akuntansi.');
      return;
    }
    setStep((value) => value + 1);
  }
  async function finish() {
    if (!terms || !privacy || busy) return;
    setBusy(true);
    setError('');
    try {
      const trial = await createTrial(registration, plan, modules, marketing);
      // Preserve existing operational accounting when onboarding an older installation.
      if (!(await db.accountingInitialSetupSetting.get('default'))) {
        const draft = configureAccounting
          ? accounting
          : {
              ...createDefaultAccountingDraft(),
              businessTemplateCode: getSuggestedAccountingBusinessTemplate(
                trial.access.modules,
              ),
            };
        await saveInitialAccountingSetup({
          enabledModules: trial.access.modules,
          configuredBy: trial.installationId,
          configuredByName: registration.owner,
          business_template_code: draft.businessTemplateCode,
          cutoff_date: draft.cutoffDate,
          fiscal_period_start: draft.fiscalPeriodStart,
          fiscal_period_end: draft.fiscalPeriodEnd,
          current_period_start: draft.currentPeriodStart,
          current_period_end: draft.currentPeriodEnd,
          base_currency_code: draft.baseCurrencyCode,
          persistSetupConfig: false,
        });
      }
      applySubscriptionModules(trial);
      writeSubscription(trial);
      localStorage.removeItem(DRAFT_KEY);
      message.success(
        'Trial 90 hari aktif. Siapkan akun lokal untuk masuk aplikasi.',
      );
      void syncBilling().catch(() => {
        /* Retried on online/focus; never block offline trial. */
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Onboarding belum dapat disimpan.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    setBusy(true);
    setError('');
    try {
      await recoverSubscription(recovery);
      message.success(
        'Langganan berhasil dihubungkan. Akun dan data operasional tetap mengikuti instalasi ini.',
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Pemulihan gagal. Periksa koneksi dan kode.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding-shell">
      <aside className="onboarding-sidebar">
        <div className="onboarding-brand">
          <img src="/frayukti-f.svg" alt="" /> Frayukti
        </div>
        <p>
          Usaha Anda.
          <br />
          Langkah baru yang lebih mudah.
        </p>
        {screen === 'wizard' && (
          <ol>
            {steps.map((label, i) => (
              <li key={label} aria-current={step === i ? 'step' : undefined}>
                <span>{i < step ? <Check size={16} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}
        <small>
          Data usaha tetap di perangkat Anda.
          <br />
          Desktop dan Android, satu langganan.
        </small>
      </aside>
      <main className="onboarding-main">
        <div className="onboarding-content">
          <span className="onboarding-eyebrow">FRAYUKTI · SANDBOX</span>
          {screen === 'welcome' ? (
            <>
              <h1>
                Mulai usaha,
                <br />
                tanpa ribet.
              </h1>
              <p className="onboarding-intro">
                Pilih paket yang sesuai, atur usaha, lalu coba selama 90 hari.
                Anda dapat memulai saat offline.
              </p>
              <div className="onboarding-actions vertical">
                <Button
                  type="primary"
                  size="large"
                  onClick={() => setScreen('wizard')}
                >
                  Daftar usaha baru <ArrowRight size={17} />
                </Button>
                <Button size="large" onClick={() => setScreen('recovery')}>
                  Sudah punya langganan / Hubungkan usaha
                </Button>
              </div>
              {onJoinHost && (
                <Button type="link" onClick={onJoinHost}>
                  Hubungkan ke host database yang sudah ada
                </Button>
              )}
            </>
          ) : screen === 'recovery' ? (
            <>
              <h1>Hubungkan usaha Anda.</h1>
              <p>
                Masukkan kode pemulihan rahasia dari halaman Langganan di
                instalasi asal. Koneksi internet diperlukan.
              </p>
              <Form layout="vertical" onFinish={() => void restore()}>
                <Form.Item label="Kode pemulihan">
                  <Input.Password
                    aria-label="Kode pemulihan"
                    value={recovery}
                    onChange={(e) => setRecovery(e.target.value)}
                    autoComplete="off"
                  />
                </Form.Item>
                <Alert
                  type="info"
                  title="Paket dan masa akses dipulihkan. Data transaksi, backup, dan akun kasir tidak dipindahkan."
                />
                <div className="onboarding-actions">
                  <Button onClick={() => setScreen('welcome')}>Kembali</Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={busy}
                    disabled={!/^[a-f0-9]{64}$/.test(recovery.trim())}
                  >
                    Hubungkan langganan
                  </Button>
                </div>
              </Form>
            </>
          ) : (
            <>
              <span className="onboarding-mobile-progress">
                Langkah {step + 1} dari 4
              </span>
              <h1>{steps[step]}</h1>
              {step === 0 && (
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={registration}
                  onFinish={() => void next()}
                  requiredMark="optional"
                >
                  <div className="onboarding-form-grid">
                    {(
                      [
                        ['owner', 'Nama pemilik', true],
                        ['business', 'Nama usaha', true],
                        ['whatsapp', 'Nomor WhatsApp', true],
                        ['businessType', 'Jenis usaha', true],
                        ['email', 'Email', false],
                        ['location', 'Lokasi usaha', false],
                      ] as const
                    ).map(([name, label, required]) => (
                      <Form.Item
                        key={name}
                        name={name}
                        label={label}
                        rules={[{ required, message: `${label} wajib diisi.` }]}
                      >
                        <Input
                          size="large"
                          autoComplete={
                            name === 'owner'
                              ? 'name'
                              : name === 'email'
                                ? 'email'
                                : 'off'
                          }
                          inputMode={
                            name === 'whatsapp'
                              ? 'tel'
                              : name === 'email'
                                ? 'email'
                                : 'text'
                          }
                          maxLength={
                            name === 'email'
                              ? 254
                              : name === 'location'
                                ? 250
                                : 100
                          }
                        />
                      </Form.Item>
                    ))}
                  </div>
                  <p className="onboarding-muted">
                    Identitas langganan terpisah dari akun kasir/karyawan. Data
                    pendaftaran dikirim setelah persetujuan dan koneksi
                    tersedia.
                  </p>
                </Form>
              )}
              {step === 1 && (
                <PlanPicker
                  plan={plan}
                  modules={modules}
                  onModules={setModules}
                  onChange={(value) => {
                    setPlan(value);
                    setAccounting((draft) => ({
                      ...draft,
                      businessTemplateCode:
                        getSuggestedAccountingBusinessTemplate(
                          getPlanModules(value, modules),
                        ),
                    }));
                  }}
                />
              )}
              {step === 2 && (
                <>
                  <p>
                    Akun dan periode bawaan sudah disiapkan. Konfigurasi
                    akuntansi yang sudah ada di instalasi ini akan
                    dipertahankan.
                  </p>
                  <Checkbox
                    checked={configureAccounting}
                    onChange={(e) => setConfigureAccounting(e.target.checked)}
                  >
                    Atur akuntansi sekarang
                  </Checkbox>
                  {configureAccounting && (
                    <div className="onboarding-accounting">
                      <OwnerAccountingSetup
                        draft={accounting}
                        errors={{}}
                        hasOperationalSignal={false}
                        onChange={(patch) =>
                          setAccounting((value) => ({ ...value, ...patch }))
                        }
                        onSelectBusinessTemplate={(value) =>
                          setAccounting((draft) => ({
                            ...draft,
                            businessTemplateCode: value,
                          }))
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <div className="onboarding-summary">
                    <ShieldCheck size={24} />
                    <div>
                      <strong>Trial {PLAN_NAMES[plan]} · 90 hari</strong>
                      <p>
                        Tanpa pembayaran sekarang. Upgrade tersedia kapan saja.
                      </p>
                    </div>
                  </div>
                  <p>
                    Dokumen berikut merupakan draf sandbox untuk peninjauan
                    sebelum rilis produksi.
                  </p>
                  <div className="onboarding-consents">
                    <Button onClick={() => setDocument('terms')}>
                      Baca Syarat Layanan
                    </Button>
                    <Checkbox
                      checked={terms}
                      onChange={(e) => setTerms(e.target.checked)}
                    >
                      Saya menyetujui Syarat Layanan
                    </Checkbox>
                    <Button onClick={() => setDocument('privacy')}>
                      Baca Kebijakan Privasi
                    </Button>
                    <Checkbox
                      checked={privacy}
                      onChange={(e) => setPrivacy(e.target.checked)}
                    >
                      Saya menerima pemberitahuan Kebijakan Privasi
                    </Checkbox>
                    <hr />
                    <Checkbox
                      checked={marketing}
                      onChange={(e) => setMarketing(e.target.checked)}
                    >
                      Saya bersedia menerima follow-up dan pemasaran melalui
                      WhatsApp/email (opsional)
                    </Checkbox>
                    <small>
                      Consent pemasaran dapat ditarik di halaman Langganan.
                    </small>
                  </div>
                </>
              )}
              <div className="onboarding-actions">
                <Button
                  disabled={busy}
                  icon={<ArrowLeft size={16} />}
                  onClick={() => {
                    setError('');
                    if (step === 0) setScreen('welcome');
                    else setStep(step - 1);
                  }}
                >
                  Kembali
                </Button>
                {step === 2 && (
                  <Button
                    onClick={() => {
                      setConfigureAccounting(false);
                      setStep(3);
                    }}
                  >
                    Lewati, gunakan bawaan
                  </Button>
                )}
                {step < 3 ? (
                  <Button
                    type="primary"
                    size="large"
                    onClick={() => void next()}
                  >
                    Lanjut <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="large"
                    loading={busy}
                    disabled={!terms || !privacy}
                    onClick={() => void finish()}
                  >
                    Setujui & mulai trial 90 hari
                  </Button>
                )}
              </div>
            </>
          )}
          {error && (
            <Alert
              className="onboarding-error"
              type="error"
              showIcon
              title={error}
            />
          )}
        </div>
      </main>
      <Modal
        title={document === 'terms' ? 'Syarat Layanan' : 'Kebijakan Privasi'}
        open={document !== null}
        onCancel={() => setDocument(null)}
        footer={
          <Button onClick={() => setDocument(null)}>Selesai membaca</Button>
        }
      >
        <div
          style={{
            whiteSpace: 'pre-wrap',
            maxHeight: '65vh',
            overflowY: 'auto',
          }}
        >
          {document === 'terms' ? TERMS_TEXT : PRIVACY_TEXT}
        </div>
      </Modal>
    </div>
  );
}
