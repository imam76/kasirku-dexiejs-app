import { useEffect, useState, type ReactNode } from 'react';
import { Alert, App, Button, Checkbox, Input } from 'antd';
import { CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { hasAccess, remainingDays, type BillingStatus } from './contract';
import { updateSubscription, type Subscription } from './storage';
import { useSubscription } from './useSubscription';
import { SubscriptionContext } from './SubscriptionContext';
import {
  openCheckout,
  requestCheckout,
  syncBilling,
  recoverSubscription,
  revealRecoveryCode,
} from './billingClient';
import { useAuth } from '@/auth/useAuth';
import { isOwnerAccessContext } from '@/services/setupKeyService';
import { PlanPicker } from './OnboardingWizard';
import { rupiah } from './presentation';
import { PLAN_NAMES, type PlanId } from './catalog';
import { backupDatabase } from '@/utils/backupRestore';
import './onboarding.css';

function SubscriptionPage({
  subscription,
  status,
  refresh,
  close,
}: {
  subscription: Subscription;
  status: BillingStatus | null;
  refresh: () => Promise<void>;
  close?: () => void;
}) {
  const { message } = App.useApp();
  const { currentUser, currentRole, isPermissionLoading, can, logout } = useAuth();
  const isOwner =
    !isPermissionLoading && Boolean(currentUser?.is_active) &&
    isOwnerAccessContext(currentUser, currentRole);
  const canBackup = !isPermissionLoading && can('SETTINGS_ACCESS');
  const [plan, setPlan] = useState<PlanId>(subscription.access.plan);
  const [modules, setModules] = useState(subscription.access.modules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<{
    redirectUrl: string;
    amount: number;
    orderId: string;
  } | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recovery, setRecovery] = useState('');
  const active = hasAccess(subscription.access);
  const latestPending = status?.orders.find((order) =>
    ['creating', 'pending'].includes(order.status),
  );
  const checkoutUrl = checkout?.redirectUrl ?? latestPending?.redirectUrl;
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Periksa koneksi lalu coba lagi.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function prepareCheckout() {
    const key = `frayukti-checkout-${subscription.installationId}`;
    const requestId = localStorage.getItem(key) ?? crypto.randomUUID();
    localStorage.setItem(key, requestId);
    try {
      const result = await requestCheckout(plan, modules, requestId);
      setCheckout(result);
    } finally {
      // A failed response may still have created or reconciled the same order.
      await refresh();
    }
  }
  // A terminal order permits the next billing period to use a fresh idempotency key.
  useEffect(() => {
    if (
      status?.orders[0] &&
      !['creating', 'pending'].includes(status.orders[0].status)
    ) {
      localStorage.removeItem(
        `frayukti-checkout-${subscription.installationId}`,
      );
      setCheckout(null);
    }
  }, [status, subscription.installationId]);
  return (
    <div className="onboarding-subscription">
      <main className="onboarding-content">
        <div className="onboarding-page-heading">
          <div>
            <span className="onboarding-eyebrow">FRAYUKTI · SANDBOX</span>
            <h1>Langganan, tanpa ribet.</h1>
          </div>
          {close && <Button onClick={close}>Kembali ke aplikasi</Button>}
        </div>
        <div className="onboarding-summary">
          <CheckCircle2 size={30} />
          <div>
            <strong>
              {active
                ? subscription.access.kind === 'trial'
                  ? `Trial aktif · ${remainingDays(subscription.access)} hari tersisa`
                  : 'Langganan aktif'
                : 'Masa akses berakhir'}
            </strong>
            <p>
              {subscription.registration.business} ·{' '}
              {PLAN_NAMES[subscription.access.plan]}
              <br />
              Berlaku sampai{' '}
              {new Date(subscription.access.end).toLocaleString('id-ID')}
            </p>
          </div>
        </div>
        {status?.paymentCheck === 'unavailable' && (
          <Alert
            type="info"
            title="Status Midtrans belum dapat diperiksa. Coba Periksa status lagi; akses yang sudah aktif tetap berlaku."
          />
        )}
        {!active && (
          <Alert
            type="warning"
            showIcon
            title="Transaksi, perubahan data, dan laporan operasional dikunci. Bayar atau hubungi Owner untuk memulihkan akses. Ekspor backup tersedia bagi pengguna dengan izin Pengaturan."
          />
        )}
        {subscription.leadPending && (
          <Alert
            type="info"
            title="Registrasi tersimpan di perangkat. Pengiriman lead menunggu koneksi ke layanan billing."
          />
        )}
        <div className="onboarding-actions">
          <Button
            icon={<RefreshCw size={16} />}
            loading={busy}
            onClick={() => void action(refresh)}
          >
            Periksa status
          </Button>
          {canBackup && (
            <Button
              icon={<Download size={16} />}
              disabled={busy}
              onClick={() => void action(backupDatabase)}
            >
              Ekspor backup data
            </Button>
          )}
          <Button disabled={busy} onClick={() => void action(logout)}>
            Ganti pengguna
          </Button>
        </div>
        <div className="onboarding-billing-grid">
          <section>
            <h2>Paket usaha Anda</h2>
            <PlanPicker
              plan={plan}
              modules={modules}
              onModules={setModules}
              onChange={setPlan}
              disabled={Boolean(latestPending) || busy}
            />
          </section>
          <section className="onboarding-bill">
            <h2>Pembayaran bulanan</h2>
            <p>
              Pilih metode pembayaran di halaman Midtrans: QRIS, Virtual
              Account, atau kartu sesuai ketersediaan merchant.
            </p>
            <p>
              Perpanjangan paket yang sama menambah satu bulan kalender.
              Perubahan paket/modul tersedia setelah akses berbayar saat ini
              habis.
            </p>
            {checkout && (
              <div className="onboarding-total">
                <span>Total dari layanan billing</span>
                <strong>{rupiah(checkout.amount)}</strong>
                <small>{checkout.orderId}</small>
              </div>
            )}
            {latestPending && (
              <Alert
                type="info"
                title={latestPending.status === 'creating'
                  ? 'Checkout belum selesai dibuat. Pilih Lanjutkan checkout untuk mencoba kembali.'
                  : `Pembayaran ${PLAN_NAMES[latestPending.plan]} · ${rupiah(latestPending.amount)} menunggu verifikasi. Periksa status setelah kembali dari checkout.`}
              />
            )}
            <div className="onboarding-actions vertical">
              <Button
                type="primary"
                size="large"
                loading={busy}
                disabled={plan === 'custom' && !modules.length}
                onClick={() => void action(prepareCheckout)}
              >
                {latestPending ? 'Lanjutkan checkout' : 'Siapkan pembayaran'}
              </Button>
              {checkoutUrl && (
                <Button
                  size="large"
                  onClick={() => void action(() => openCheckout(checkoutUrl))}
                >
                  Buka Midtrans Sandbox
                </Button>
              )}
            </div>
            <small>
              Checkout dibuka di browser eksternal. Kembali ke aplikasi tidak
              mengonfirmasi pembayaran.
            </small>
          </section>
        </div>
        <section className="onboarding-section">
          <h2>Riwayat pembayaran</h2>
          {!status?.orders.length ? (
            <p>Belum ada pembayaran tersinkron.</p>
          ) : (
            <ul className="onboarding-history">
              {status.orders.map((order) => (
                <li key={order.orderId}>
                  <div>
                    <strong>{PLAN_NAMES[order.plan]}</strong>
                    <small>
                      {new Date(order.createdAt).toLocaleDateString('id-ID')} ·{' '}
                      {order.orderId}
                    </small>
                  </div>
                  <div>
                    {rupiah(order.amount)}
                    <small>
                      {order.status === 'paid'
                        ? 'Berhasil, akses diaktifkan'
                        : order.status === 'pending'
                          ? 'Menunggu pembayaran'
                          : order.status === 'review_required'
                            ? 'Memerlukan pemeriksaan dukungan'
                            : order.status}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {isOwner && <section className="onboarding-section">
          <h2>Identitas & pemulihan</h2>
          <p>
            Simpan kode rahasia di tempat aman. Pemilik kode dapat menghubungkan
            langganan di perangkat lain. Kode baru dapat digunakan di perangkat
            lain setelah registrasi tersinkron.
          </p>
          <Button disabled={busy} onClick={() => void action(async () => {
            if (recoveryCode) setRecoveryCode(null);
            else setRecoveryCode(await revealRecoveryCode());
          })}>
            {recoveryCode
              ? 'Sembunyikan kode pemulihan'
              : 'Tampilkan kode pemulihan'}
          </Button>
          {recoveryCode && (
            <Input.TextArea
              readOnly
              aria-label="Kode pemulihan usaha"
              value={recoveryCode}
              autoSize
              style={{ marginTop: 12 }}
            />
          )}
          <details className="onboarding-details">
            <summary>Pulihkan / hubungkan langganan lain</summary>
            <p>
              Data operasional tetap berada di instalasi ini. Paket usaha akan
              mengikuti kode pemulihan.
            </p>
            <Input.Password
              aria-label="Kode pemulihan langganan"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
            />
            <Button
              disabled={!/^[a-f0-9]{64}$/.test(recovery.trim()) || busy}
              onClick={() =>
                void action(async () => {
                  await recoverSubscription(recovery);
                  setRecovery('');
                  await refresh();
                })
              }
            >
              Pulihkan akses
            </Button>
          </details>
        </section>}
        {isOwner && <section className="onboarding-section">
          <h2>Preferensi komunikasi</h2>
          <Checkbox
            checked={subscription.consent.marketing}
            disabled={busy}
            onChange={(e) => {
              if (!isOwner) return;
              updateSubscription({
                consent: {
                  ...subscription.consent,
                  marketing: e.target.checked,
                  marketingUpdatedAt: new Date().toISOString(),
                },
                consentPending: true,
              });
              void syncBilling().catch(() =>
                message.info(
                  'Preferensi disimpan dan akan dikirim saat terhubung.',
                ),
              );
            }}
          >
            Izinkan follow-up dan pemasaran WhatsApp/email
          </Checkbox>
          {subscription.consentPending && (
            <p>Perubahan consent menunggu sinkronisasi.</p>
          )}
        </section>}
        {error && <Alert role="alert" type="error" showIcon title={error} />}
      </main>
    </div>
  );
}
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const subscription = useSubscription();
  const [manage, setManage] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [syncError, setSyncError] = useState('');
  useEffect(() => {
    if (!subscription || !hasAccess(subscription.access, now)) return;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(
        2_147_483_647,
        Math.max(1, Date.parse(subscription.access.end) - now),
      ),
    );
    return () => clearTimeout(timeout);
  }, [subscription, now]);
  async function refresh() {
    try {
      const next = await syncBilling();
      if (next) setStatus(next);
      setSyncError('');
    } catch (reason) {
      setSyncError(
        reason instanceof Error
          ? reason.message
          : 'Billing belum terhubung. Akses lokal tetap berlaku sampai tanggal akhir.',
      );
    }
    setNow(Date.now());
  }
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    const tick = () => {
      setNow(Date.now());
    };
    const timer = window.setInterval(tick, 15_000);
    const syncTimer = window.setInterval(resume, 60_000);
    resume();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearInterval(timer);
      clearInterval(syncTimer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  if (!subscription) return null;
  const active = hasAccess(subscription.access, now);
  if (!active || manage)
    return (
      <>
        <SubscriptionPage
          key={`${subscription.installationId}:${currentUser?.id}`}
          subscription={subscription}
          status={
            status?.businessId === subscription.businessId ? status : null
          }
          refresh={refresh}
          close={active ? () => setManage(false) : undefined}
        />
        {syncError && (
          <Alert
            className="onboarding-sync-error"
            type="info"
            title={`${syncError} Akses offline mengikuti masa berlaku yang tersimpan.`}
          />
        )}
      </>
    );
  return (
    <SubscriptionContext.Provider
      value={{ subscription, now, openManage: () => setManage(true) }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
