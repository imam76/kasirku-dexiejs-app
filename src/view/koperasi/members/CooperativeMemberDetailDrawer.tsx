import { Descriptions, Drawer, Tag, Typography } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeMember, CooperativeMemberStatus } from '@/types';
import { cooperativeMemberStatusOptions } from './memberOptions';

const { Paragraph } = Typography;

interface CooperativeMemberDetailDrawerProps {
  member: CooperativeMember | null;
  open: boolean;
  onClose: () => void;
}

export default function CooperativeMemberDetailDrawer({
  member,
  open,
  onClose,
}: CooperativeMemberDetailDrawerProps) {
  const { t } = useI18n();
  const statusLabelMap = cooperativeMemberStatusOptions.reduce<Record<CooperativeMemberStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeMemberStatus, string>);

  const statusOption = member
    ? cooperativeMemberStatusOptions.find((option) => option.value === member.status)
    : undefined;

  return (
    <Drawer
      title={member ? `${member.member_number} - ${member.name}` : t('cooperative.members.detailTitle')}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
    >
      {member && (
        <div className="space-y-5">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.members.table.status')}>
              <Tag color={statusOption?.color}>{statusLabelMap[member.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.memberNumber')}>
              {member.member_number}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.name')}>
              {member.name}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.area')}>
              {member.area_name
                ? <Tag color="blue">{member.area_code ? `${member.area_code} - ${member.area_name}` : member.area_name}</Tag>
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.officer')}>
              {member.officer_name
                ? `${member.officer_name}${member.officer_position ? ` - ${member.officer_position}` : ''}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.identityNumber')}>
              {member.identity_number || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.phone')}>
              {member.phone || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.form.joinDate')}>
              {member.join_date.slice(0, 10)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.createdBy')}>
              {member.created_by_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.updatedBy')}>
              {member.updated_by_name || '-'}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Paragraph className="mb-1 text-sm font-medium text-gray-600">
              {t('cooperative.members.form.address')}
            </Paragraph>
            <Paragraph className="whitespace-pre-wrap text-gray-700">
              {member.address || '-'}
            </Paragraph>
          </div>

          <div>
            <Paragraph className="mb-1 text-sm font-medium text-gray-600">
              {t('cooperative.members.form.notes')}
            </Paragraph>
            <Paragraph className="whitespace-pre-wrap text-gray-700">
              {member.notes || '-'}
            </Paragraph>
          </div>
        </div>
      )}
    </Drawer>
  );
}
