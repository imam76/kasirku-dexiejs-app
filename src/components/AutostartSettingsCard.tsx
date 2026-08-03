import { useEffect, useState } from 'react'
import { Alert, App, Card, Switch, Typography } from 'antd'
import { Power } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { isTauriDesktop } from '@/utils/export/platform'

const { Paragraph, Text } = Typography

const loadAutostartApi = () => import('@tauri-apps/plugin-autostart')

export default function AutostartSettingsCard() {
  const { message } = App.useApp()
  const { t } = useI18n()
  const [isSupported] = useState(() => isTauriDesktop())
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(isSupported)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!isSupported) return

    let isMounted = true

    const loadStatus = async () => {
      try {
        const autostart = await loadAutostartApi()
        const enabled = await autostart.isEnabled()

        if (isMounted) {
          setIsEnabled(enabled)
          setHasError(false)
        }
      } catch (error) {
        console.error('Failed to read autostart status:', error)
        if (isMounted) setHasError(true)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadStatus()

    return () => {
      isMounted = false
    }
  }, [isSupported])

  const handleChange = async (checked: boolean) => {
    setIsLoading(true)
    setHasError(false)

    try {
      const autostart = await loadAutostartApi()

      if (checked) {
        await autostart.enable()
      } else {
        await autostart.disable()
      }

      const enabled = await autostart.isEnabled()
      setIsEnabled(enabled)

      if (enabled !== checked) {
        throw new Error('Autostart state did not match the requested value')
      }

      message.success(
        t(checked ? 'settings.autostartEnabled' : 'settings.autostartDisabled'),
      )
    } catch (error) {
      console.error('Failed to update autostart status:', error)
      setHasError(true)
      message.error(t('settings.autostartUpdateFailed'))

      try {
        const autostart = await loadAutostartApi()
        setIsEnabled(await autostart.isEnabled())
      } catch {
        // Keep the last confirmed state when the operating system cannot be queried.
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card
      title={(
        <div className="flex items-center gap-2">
          <Power className="h-5 w-5" />
          {t('settings.autostartTitle')}
        </div>
      )}
      className="shadow-md"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Text strong>{t('settings.autostartLabel')}</Text>
          <Paragraph className="!mb-0 !mt-1 text-gray-600">
            {t('settings.autostartDescription')}
          </Paragraph>
        </div>
        <Switch
          aria-label={t('settings.autostartLabel')}
          checked={isEnabled}
          loading={isLoading}
          disabled={!isSupported || isLoading}
          onChange={handleChange}
        />
      </div>

      {!isSupported && (
        <Alert
          className="mt-4"
          type="info"
          showIcon
          title={t('settings.autostartDesktopOnly')}
        />
      )}

      {hasError && (
        <Alert
          className="mt-4"
          type="error"
          showIcon
          title={t('settings.autostartLoadFailed')}
        />
      )}
    </Card>
  )
}
