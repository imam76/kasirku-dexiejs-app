import { useEffect, useState } from 'react';
import { App, Button, Card, Input, Space, Typography, Upload } from 'antd';
import { Building2, ImagePlus, Save, Trash2 } from 'lucide-react';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useI18n } from '@/hooks/useI18n';
import type { CompanyProfileSettingInput } from '@/services/companyProfileSettingService';

const { Paragraph, Text } = Typography;

const COMPANY_LOGO_MAX_SIZE_BYTES = 512 * 1024;
const ACCEPTED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export default function CompanyProfileSettingsCard() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { profile, isLoading, isSaving, saveProfile } = useCompanyProfileSetting();
  const [draft, setDraft] = useState<CompanyProfileSettingInput>({});

  useEffect(() => {
    if (!profile) return;

    setDraft({
      company_name: profile.company_name,
      logo_data_url: profile.logo_data_url,
      logo_file_name: profile.logo_file_name,
      logo_mime_type: profile.logo_mime_type,
      logo_size: profile.logo_size,
    });
  }, [profile]);

  const handleLogoFile = async (file: File) => {
    if (!ACCEPTED_LOGO_MIME_TYPES.includes(file.type)) {
      message.error(t('settings.companyProfile.logoTypeError'));
      return;
    }

    if (file.size > COMPANY_LOGO_MAX_SIZE_BYTES) {
      message.error(t('settings.companyProfile.logoSizeError'));
      return;
    }

    try {
      const logoDataUrl = await readFileAsDataUrl(file);
      setDraft((current) => ({
        ...current,
        logo_data_url: logoDataUrl,
        logo_file_name: file.name,
        logo_mime_type: file.type,
        logo_size: file.size,
      }));
    } catch (error) {
      console.error(error);
      message.error(t('settings.companyProfile.logoReadError'));
    }
  };

  const handleSave = async () => {
    try {
      await saveProfile(draft);
      message.success(t('settings.companyProfile.saveSuccess'));
    } catch (error) {
      console.error(error);
      message.error(t('settings.companyProfile.saveFailed'));
    }
  };

  const removeLogo = () => {
    setDraft((current) => ({
      ...current,
      logo_data_url: undefined,
      logo_file_name: undefined,
      logo_mime_type: undefined,
      logo_size: undefined,
    }));
  };

  return (
    <Card
      title={<div className="flex min-w-0 items-center gap-2"><Building2 className="h-5 w-5 shrink-0" /> {t('settings.companyProfile.title')}</div>}
      className="shadow-md"
      loading={isLoading}
    >
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
            {draft.logo_data_url ? (
              <img
                src={draft.logo_data_url}
                alt={t('settings.companyProfile.logoAlt')}
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-10 w-10 text-gray-300" />
            )}
          </div>
          <Space size={8} wrap className="justify-center">
            <Upload
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              beforeUpload={(file) => {
                void handleLogoFile(file as File);
                return false;
              }}
              showUploadList={false}
            >
              <Button icon={<ImagePlus className="h-4 w-4" />}>
                {t('settings.companyProfile.uploadLogo')}
              </Button>
            </Upload>
            <Button
              icon={<Trash2 className="h-4 w-4" />}
              onClick={removeLogo}
              disabled={!draft.logo_data_url}
            >
              {t('settings.companyProfile.removeLogo')}
            </Button>
          </Space>
        </div>

        <div className="space-y-4">
          <div>
            <Text className="mb-2 block font-semibold text-gray-700">
              {t('settings.companyProfile.companyName')}
            </Text>
            <Input
              value={draft.company_name}
              onChange={(event) => setDraft((current) => ({ ...current, company_name: event.target.value }))}
              placeholder={t('settings.companyProfile.companyNamePlaceholder')}
              maxLength={120}
            />
          </div>
          <Paragraph className="!mb-0 text-gray-600">
            {t('settings.companyProfile.description')}
          </Paragraph>
          {draft.logo_file_name && (
            <Text type="secondary" className="block">
              {draft.logo_file_name}
            </Text>
          )}
          <Button
            type="primary"
            icon={<Save className="h-4 w-4" />}
            onClick={handleSave}
            loading={isSaving}
          >
            {t('settings.companyProfile.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
