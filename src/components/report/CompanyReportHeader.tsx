import { Building2 } from 'lucide-react';
import { Space, Typography } from 'antd';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';

const { Text, Title } = Typography;

interface CompanyReportHeaderProps {
  reportTitle: string;
  reportDescription?: string;
}

export default function CompanyReportHeader({
  reportTitle,
  reportDescription,
}: CompanyReportHeaderProps) {
  const { profile, isLoading } = useCompanyProfileSetting();
  const hasCompanyIdentity = Boolean(profile?.company_name || profile?.logo_data_url);

  if (isLoading || !hasCompanyIdentity) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
            {profile?.logo_data_url ? (
              <img
                src={profile.logo_data_url}
                alt={profile.company_name || reportTitle}
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-7 w-7 text-gray-300" />
            )}
          </div>
          <Space direction="vertical" size={0} className="min-w-0">
            <Title level={4} className="!mb-0 truncate">
              {profile?.company_name || reportTitle}
            </Title>
            {profile?.company_name && (
              <Text type="secondary" className="truncate">
                {reportTitle}
              </Text>
            )}
          </Space>
        </div>
        {reportDescription && (
          <Text type="secondary" className="max-w-xl sm:text-right">
            {reportDescription}
          </Text>
        )}
      </div>
    </div>
  );
}
