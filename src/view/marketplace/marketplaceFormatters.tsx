import { Tag } from 'antd';
import type { MarketplaceAccountStatus, MarketplaceInternalStatus } from '@/services/marketplaceAdapter';

const INTERNAL_STATUS_LABELS: Record<MarketplaceInternalStatus, string> = {
  WAITING_PAYMENT: 'Menunggu Pembayaran',
  READY_TO_PROCESS: 'Siap Diproses',
  SHIPPED: 'Dikirim',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

const INTERNAL_STATUS_COLORS: Record<MarketplaceInternalStatus, string> = {
  WAITING_PAYMENT: 'gold',
  READY_TO_PROCESS: 'blue',
  SHIPPED: 'cyan',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

export const InternalStatusTag = ({ status }: { status: MarketplaceInternalStatus }) => (
  <Tag color={INTERNAL_STATUS_COLORS[status]}>{INTERNAL_STATUS_LABELS[status]}</Tag>
);

const ACCOUNT_STATUS: Record<MarketplaceAccountStatus, { label: string; color: string }> = {
  CONNECTED: { label: 'Terhubung', color: 'green' },
  REAUTH_REQUIRED: { label: 'Perlu Hubungkan Ulang', color: 'orange' },
  RESTRICTED: { label: 'Dibatasi Shopee', color: 'red' },
};

export const AccountStatusTag = ({ status }: { status: MarketplaceAccountStatus }) => {
  const value = ACCOUNT_STATUS[status] ?? { label: status, color: 'default' };
  return <Tag color={value.color}>{value.label}</Tag>;
};
