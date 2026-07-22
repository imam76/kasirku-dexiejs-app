import { AutoComplete, Button, Form, Input, InputNumber, Modal, Select, Tag, Tooltip } from 'antd';
import { ChevronDown, ChevronUp, TicketPercent, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, MembershipSetting, Promo } from '@/types';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
import type { PromoEvaluationResult } from '@/services/promoService';
import { formatCurrency } from '@/utils/formatters';
import { buildPosVoucherOptions, isAppliedPosVoucher } from '@/utils/posVoucher';

const MEMBERSHIP_PANEL_STORAGE_KEY = 'frayukti-pos-membership-panel-open';

interface MembershipCheckoutPanelProps {
  members: Contact[];
  selectedMember: Contact | null;
  memberContactId?: string;
  voucherCode: string;
  redeemPoints: string;
  membershipSetting: MembershipSetting;
  promoPreview: PromoEvaluationResult;
  membershipPreview: MembershipCheckoutEvaluation;
  voucherPromos: Promo[];
  onMemberChange: (memberContactId?: string) => void;
  onVoucherCodeChange: (voucherCode: string) => void;
  onRedeemPointsChange: (points: string) => void;
  onCreateMember: (input: QuickCreateMemberInput) => Promise<Contact>;
  isCreatingMember: boolean;
}

export default function MembershipCheckoutPanel({
  members,
  selectedMember,
  memberContactId,
  voucherCode,
  redeemPoints,
  membershipSetting,
  promoPreview,
  membershipPreview,
  voucherPromos,
  onMemberChange,
  onVoucherCodeChange,
  onRedeemPointsChange,
  onCreateMember,
  isCreatingMember,
}: MembershipCheckoutPanelProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<QuickCreateMemberInput>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return Boolean(memberContactId || voucherCode.trim());
    }

    const savedValue = localStorage.getItem(MEMBERSHIP_PANEL_STORAGE_KEY);
    return savedValue ? savedValue === 'true' : Boolean(memberContactId || voucherCode.trim());
  });
  const voucherValue = voucherCode.trim();
  const shouldForceExpanded = Boolean(memberContactId || voucherValue);
  const isPanelExpanded = isExpanded || shouldForceExpanded;
  const pointBalance = Math.max(0, Math.floor(Number(selectedMember?.membership_points_balance || 0)));
  const selectedMemberSummary = selectedMember
    ? `${selectedMember.membership_number ?? '-'} - ${selectedMember.name}`
    : undefined;
  const voucherDiscounts = promoPreview.discount_breakdown;
  const hasVoucherDiscount = voucherDiscounts.some((discount) => discount.amount > 0);
  const hasValidVoucher = isAppliedPosVoucher(voucherValue, promoPreview.applied_promos_snapshot);
  const discountTotal = membershipPreview.discount_breakdown.reduce((sum, discount) => sum + discount.amount, 0);
  const panelSummary = [
    selectedMemberSummary ?? 'Member belum dipilih',
    voucherValue ? `Voucher ${voucherValue}` : 'Voucher opsional',
    discountTotal > 0 ? `Diskon Rp ${formatCurrency(discountTotal)}` : undefined,
  ].filter(Boolean).join(' / ');
  const voucherOptions = useMemo(() => buildPosVoucherOptions(voucherPromos), [voucherPromos]);

  useEffect(() => {
    localStorage.setItem(MEMBERSHIP_PANEL_STORAGE_KEY, String(isPanelExpanded));
  }, [isPanelExpanded]);

  const closeModal = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handleCreateMember = async (values: QuickCreateMemberInput) => {
    await onCreateMember(values);
    closeModal();
  };

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left transition-colors hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-100"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isPanelExpanded}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700">
            <TicketPercent size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900">Member & Voucher</span>
            <span className="block truncate text-xs font-normal text-gray-500">{panelSummary}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <Tooltip title={isPanelExpanded ? 'Sembunyikan' : 'Tampilkan'}>
            <Button
              type="text"
              size="small"
              icon={isPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              onClick={() => setIsExpanded((current) => !current)}
              aria-label={isPanelExpanded ? 'Sembunyikan member dan voucher' : 'Tampilkan member dan voucher'}
              className="text-gray-600"
            />
          </Tooltip>
        </div>
      </div>

      {isPanelExpanded && (
        <div className="space-y-3 border-t border-gray-100 p-3 pt-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
                <UserCheck size={13} />
                <span>Member</span>
              </div>
              <Tooltip title="Tambah member">
                <Button
                  type="text"
                  size="small"
                  icon={<UserPlus size={14} />}
                  onClick={() => setIsModalOpen(true)}
                  className="h-7 px-2 text-xs text-green-700"
                >
                  Baru
                </Button>
              </Tooltip>
            </div>

            <Select
              allowClear
              showSearch
              className="w-full"
              value={memberContactId}
              placeholder="Pilih member"
              optionFilterProp="label"
              onChange={(value) => {
                onMemberChange(value);
                if (!value) onRedeemPointsChange('');
              }}
              options={members.map((member) => ({
                value: member.id,
                label: `${member.membership_number ?? '-'} - ${member.name}`,
                searchText: `${member.membership_number ?? ''} ${member.name} ${member.phone ?? ''}`,
              }))}
              filterOption={(input, option) => String(option?.searchText ?? option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />

            {selectedMember && (
              <div className="space-y-2 text-xs text-gray-700">
                <div className="flex min-w-0 items-center gap-2 pt-1">
                  <Tag color="blue" className="m-0 shrink-0">{selectedMember.membership_number ?? '-'}</Tag>
                  <span className="min-w-0 flex-1 truncate text-xs" title={selectedMember.name}>{selectedMember.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
                    <div className="text-gray-500">Saldo poin</div>
                    <div className="font-semibold text-gray-900">{pointBalance}</div>
                  </div>
                  <div className="rounded-md border border-green-100 bg-green-50 px-2 py-1.5">
                    <div className="text-gray-500">Poin didapat</div>
                    <div className="font-semibold text-green-700">{membershipPreview.earned_points}</div>
                  </div>
                </div>
                {membershipSetting.redeem_enabled && (
                  <div>
                    <div className="mb-1 text-gray-500">Pakai poin</div>
                    <InputNumber<number>
                      min={0}
                      max={pointBalance}
                      value={redeemPoints ? Number(redeemPoints) : 0}
                      className="w-full"
                      onChange={(value) => onRedeemPointsChange(value ? String(Math.floor(value)) : '')}
                    />
                  </div>
                )}
                {membershipPreview.redeem_amount > 0 && (
                  <div className="flex justify-between gap-3 rounded-md border border-green-100 bg-green-50 px-2 py-1.5 font-semibold text-green-700">
                    <span>Redeem poin</span>
                    <span>-Rp {formatCurrency(membershipPreview.redeem_amount)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
              <TicketPercent size={13} />
              <span>Voucher</span>
            </div>
            <AutoComplete
              data-testid="pos-voucher-input"
              allowClear
              value={voucherCode || undefined}
              options={voucherOptions}
              onChange={(value) => onVoucherCodeChange(String(value ?? ''))}
              filterOption={(input, option) => String(option?.searchText ?? option?.label ?? '')
                .toLowerCase()
                .includes(input.trim().toLowerCase())}
              placeholder={t('promo.voucherPlaceholder')}
              notFoundContent="Ketik kode voucher untuk memasukkan secara manual"
              className="w-full"
              styles={{ popup: { root: { zIndex: 1200 } } }}
            />
          </div>

          {(hasVoucherDiscount || voucherValue) && (
            <div className="space-y-1 rounded-md border border-green-100 bg-green-50/70 p-2 text-xs">
              {!hasValidVoucher && (
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>{t('cart.subtotal')}</span>
                  <span className="font-medium text-gray-800">Rp {formatCurrency(promoPreview.subtotal_before_discount)}</span>
                </div>
              )}
              {voucherDiscounts.map((discount) => (
                <div key={discount.label} className="flex justify-between gap-3 font-semibold text-green-700">
                  <span className="truncate">{discount.label}</span>
                  <span className="shrink-0">-Rp {formatCurrency(discount.amount)}</span>
                </div>
              ))}
              {!hasVoucherDiscount && voucherValue && (
                <p className="text-gray-500">{t('promo.noVoucherDiscount')}</p>
              )}
            </div>
          )}
        </div>
      )}

      <Modal
        title="Tambah Member"
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isCreatingMember}
        destroyOnHidden
        forceRender
      >
        <Form<QuickCreateMemberInput>
          form={form}
          layout="vertical"
          onFinish={handleCreateMember}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Nama"
            rules={[{ required: true, whitespace: true, message: 'Nama member wajib diisi.' }]}
          >
            <Input placeholder="Nama member" />
          </Form.Item>
          <Form.Item name="phone" label="Telepon">
            <Input placeholder="Nomor telepon" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Format email tidak valid.' }]}>
            <Input placeholder="email@contoh.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
