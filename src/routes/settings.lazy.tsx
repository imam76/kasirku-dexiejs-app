import { createLazyFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { App, Card, Button, Upload, Typography, Alert, Segmented } from 'antd'
import { Download, Upload as UploadIcon, Database, AlertTriangle, FileText } from 'lucide-react'
import { backupDatabase, restoreDatabase } from '@/utils/backupRestore'
import { useNavigate } from '@tanstack/react-router'
import PrinterSettingsCard from '@/components/PrinterSettingsCard'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/auth/useAuth'
import { UserManagement } from '@/view/auth/UserManagement'
import { ActivityLogViewer } from '@/view/auth/ActivityLogViewer'
import { useSalesDocumentMarginSettings } from '@/hooks/useSalesDocumentMarginSettings'
import type { SalesDocumentMarginBasis } from '@/types'

const { Paragraph } = Typography

export const Route = createLazyFileRoute('/settings')({
  component: Settings,
})

function Settings() {
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { can } = useAuth()
  const { marginBasis, setMarginBasis } = useSalesDocumentMarginSettings()
  const [loading, setLoading] = useState(false)

  const handleBackup = async () => {
    try {
      setLoading(true)
      await backupDatabase()
      message.success(t('settings.backupSuccess'))
    } catch (error) {
      console.error(error)
      message.error(t('settings.backupFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (file: File) => {
    modal.confirm({
      title: t('settings.restoreConfirmTitle'),
      icon: <AlertTriangle className="text-red-500 w-6 h-6 mr-2" />,
      content: (
        <div className="space-y-2">
          <p>{t('settings.restoreConfirmQuestion')}</p>
          <Alert
            message={t('settings.warning')}
            description={t('settings.restoreWarningDescription')}
            type="warning"
            showIcon
            className="mt-2"
          />
        </div>
      ),
      okText: t('settings.restoreOk'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          setLoading(true)
          await restoreDatabase(file)
          message.success(t('settings.restoreSuccess'))
          // Optional: Reload page to ensure all states are refreshed
          setTimeout(() => {
            window.location.reload()
          }, 1500)
        } catch (error) {
          console.error(error)
          message.error(t('settings.restoreFailed'))
        } finally {
          setLoading(false)
        }
      },
    })
    return false // Prevent auto upload
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Database className="w-8 h-8 text-blue-600" />
          {t('settings.title')}
        </h1>
        <p className="text-gray-500 mt-2">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="mb-6">
        <PrinterSettingsCard />
      </div>

      <div className="mb-6">
        <Card
          title={<div className="flex items-center gap-2"><FileText className="w-5 h-5" /> {t('settings.salesDocumentTitle')}</div>}
          className="shadow-md"
        >
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">
                {t('settings.salesDocumentMarginBasis')}
              </div>
              <Segmented
                value={marginBasis}
                onChange={(value) => setMarginBasis(value as SalesDocumentMarginBasis)}
                options={[
                  { label: t('settings.salesDocumentMarginBeforeTax'), value: 'BEFORE_TAX' },
                  { label: t('settings.salesDocumentMarginAfterTax'), value: 'AFTER_TAX' },
                ]}
              />
            </div>
            <Paragraph className="!mb-0 text-gray-600">
              {marginBasis === 'BEFORE_TAX'
                ? t('settings.salesDocumentMarginBeforeTaxHelp')
                : t('settings.salesDocumentMarginAfterTaxHelp')}
            </Paragraph>
          </div>
        </Card>
      </div>

      {can('USER_MANAGE') && (
        <div className="mb-6">
          <UserManagement />
        </div>
      )}

      {can('ACTIVITY_LOG_VIEW') && (
        <div className="mb-6">
          <ActivityLogViewer />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Backup Section */}
        <Card 
          title={<div className="flex items-center gap-2"><Download className="w-5 h-5" /> {t('settings.backupTitle')}</div>}
          className="shadow-md hover:shadow-lg transition-shadow"
        >
          <div className="space-y-4">
            <Paragraph className="text-gray-600">
              {t('settings.backupDescription')}
            </Paragraph>
            <Button 
              type="primary" 
              icon={<Download className="w-4 h-4" />} 
              onClick={handleBackup}
              loading={loading}
              size="large"
              block
            >
              {t('settings.backupButton')}
            </Button>
          </div>
        </Card>

        {/* Restore Section */}
        <Card 
          title={<div className="flex items-center gap-2"><UploadIcon className="w-5 h-5" /> {t('settings.restoreTitle')}</div>}
          className="shadow-md hover:shadow-lg transition-shadow"
        >
          <div className="space-y-4">
            <Paragraph className="text-gray-600">
              {t('settings.restoreDescription')}
              <span className="font-bold text-red-500 block mt-1">
                {t('settings.restoreWarningShort')}
              </span>
            </Paragraph>
            <Upload
              beforeUpload={handleRestore}
              showUploadList={false}
              accept=".json"
              customRequest={() => {}} // Dummy to prevent auto request
            >
              <Button 
                icon={<UploadIcon className="w-4 h-4" />} 
                loading={loading}
                size="large"
                danger
                block
              >
                {t('settings.restoreButton')}
              </Button>
            </Upload>
          </div>
        </Card>
      </div>
      
      <div className="mt-8 text-center">
        <Button onClick={() => navigate({ to: '/' })} type="text">
          {t('settings.backToDashboard')}
        </Button>
      </div>
    </div>
  )
}
