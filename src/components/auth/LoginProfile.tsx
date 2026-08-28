import { useMemo, useState } from 'react';
import { App, Avatar, Button, Divider, Form, Input, Modal, Popover, Space, Tag, Typography } from 'antd';
import { ChevronDown, KeyRound, LogOut, Mail, Moon, Settings, ShieldCheck, Sun } from 'lucide-react';
import { changeCurrentUserPin } from '@/auth/authService';
import { AUTH_PIN_LENGTH, AUTH_PIN_VALIDATION_MESSAGE } from '@/auth/pinPolicy';
import { useI18n } from '@/hooks/useI18n';
import type { AuthUser, Role } from '@/types';
import { buildAuthUserProfileSummary } from '@/utils/auth/profileDisplay';

const { Text } = Typography;

interface LoginProfileProps {
  currentUser: AuthUser | null;
  currentRole: Role | null;
  canAccessSettings: boolean;
  isDark: boolean;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onPinChanged: () => Promise<unknown>;
}

interface ChangePinFormValues {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}

export default function LoginProfile({
  currentUser,
  currentRole,
  canAccessSettings,
  isDark,
  onOpenSettings,
  onToggleTheme,
  onLogout,
  onPinChanged,
}: LoginProfileProps) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [pinForm] = Form.useForm<ChangePinFormValues>();
  const [open, setOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const profile = useMemo(
    () => currentUser
      ? buildAuthUserProfileSummary(currentUser, currentRole, t('root.currentUserFallback'))
      : null,
    [currentRole, currentUser, t],
  );

  if (!currentUser || !profile) return null;

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  const handleOpenSettings = () => {
    setOpen(false);
    onOpenSettings();
  };

  const openPinModal = () => {
    setOpen(false);
    pinForm.resetFields();
    setPinModalOpen(true);
  };

  const closePinModal = () => {
    if (isChangingPin) return;
    setPinModalOpen(false);
    pinForm.resetFields();
  };

  const handleChangePin = async (values: ChangePinFormValues) => {
    if (values.newPin !== values.confirmPin) {
      message.error(t('root.profile.pinMismatch'));
      return;
    }

    setIsChangingPin(true);
    try {
      await changeCurrentUserPin({
        currentPin: values.currentPin,
        newPin: values.newPin,
      });
      await onPinChanged();
      message.success(t('root.profile.changePinSuccess'));
      setPinModalOpen(false);
      pinForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('root.profile.changePinFailed'));
    } finally {
      setIsChangingPin(false);
    }
  };

  const content = (
    <div className="w-72">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar size={44} className="shrink-0 bg-blue-600 text-sm font-semibold">
          {profile.initials}
        </Avatar>
        <div className="min-w-0 flex-1">
          <Text type="secondary" className="block text-xs">
            {t('root.profile.currentSession')}
          </Text>
          <Text strong className="block truncate text-base">
            {profile.displayName}
          </Text>
          <Tag color={currentUser.is_active ? 'green' : 'default'} className="mt-2">
            {currentUser.is_active ? t('root.profile.active') : t('root.profile.inactive')}
          </Tag>
        </div>
      </div>

      <Divider className="my-3" />

      <div className="space-y-3">
        <div className="flex min-w-0 items-start gap-2">
          <Mail size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <Text type="secondary" className="block text-xs">
              {t('root.profile.email')}
            </Text>
            <Text className="block truncate">
              {profile.email ?? t('root.profile.noEmail')}
            </Text>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <Text type="secondary" className="block text-xs">
              {t('root.profile.role')}
            </Text>
            <Text className="block truncate">
              {profile.roleLabel}
            </Text>
          </div>
        </div>
      </div>

      <Divider className="my-3" />

      <div className="space-y-2">
        <Button
          block
          icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
          onClick={onToggleTheme}
        >
          {isDark ? t('common.useLightTheme') : t('common.useDarkTheme')}
        </Button>
        {canAccessSettings && (
          <Button block icon={<Settings size={16} />} onClick={handleOpenSettings}>
            {t('root.openSettings')}
          </Button>
        )}
        <Button block icon={<KeyRound size={16} />} onClick={openPinModal}>
          {t('root.profile.changePin')}
        </Button>
        <Button danger block icon={<LogOut size={16} />} onClick={handleLogout}>
          {t('root.logout')}
        </Button>
      </div>

      <Divider className="my-3" />

      <Text type="secondary" className="block text-center text-xs">
        {t('root.profile.appVersion', { version: __APP_VERSION__ })}
      </Text>
    </div>
  );

  return (
    <>
      <Popover
        arrow={false}
        content={content}
        open={open}
        placement="bottomRight"
        trigger="click"
        onOpenChange={setOpen}
      >
        <Button
          type="text"
          className="!flex !h-11 !items-center !rounded-full !px-2 text-gray-600 hover:!bg-gray-100 dark:!text-gray-100 dark:hover:!bg-gray-700"
          aria-label={t('root.profile.ariaLabel', { name: profile.displayName })}
          title={profile.displayName}
        >
          <Space size={8} className="min-w-0">
            <Avatar size={32} className="bg-blue-600 text-xs font-semibold">
              {profile.initials}
            </Avatar>
            <span className="hidden min-w-0 text-left md:block">
              <span className="block max-w-[140px] truncate text-sm font-medium leading-4">
                {profile.displayName}
              </span>
              <span className="block max-w-[140px] truncate text-xs leading-4 text-gray-500 dark:text-gray-300">
                {profile.roleLabel}
              </span>
            </span>
            <ChevronDown size={14} className="hidden shrink-0 text-gray-400 md:block" />
          </Space>
        </Button>
      </Popover>

      <Modal
        title={t('root.profile.changePinTitle')}
        open={pinModalOpen}
        onCancel={closePinModal}
        onOk={() => pinForm.submit()}
        okText={t('root.profile.changePinSubmit')}
        cancelText={t('common.cancel')}
        confirmLoading={isChangingPin}
        destroyOnHidden
        forceRender
      >
        <Form<ChangePinFormValues>
          form={pinForm}
          layout="vertical"
          className="mt-4"
          requiredMark={false}
          onFinish={handleChangePin}
        >
          <Form.Item
            name="currentPin"
            label={t('root.profile.currentPin')}
            rules={[{ required: true, message: t('root.profile.currentPinRequired') }]}
          >
            <Input.Password
              inputMode="numeric"
              autoComplete="current-password"
              placeholder={t('root.profile.currentPinPlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="newPin"
            label={t('root.profile.newPin')}
            rules={[
              { required: true, message: t('root.profile.newPinRequired') },
              { len: AUTH_PIN_LENGTH, message: AUTH_PIN_VALIDATION_MESSAGE },
              { pattern: /^\d+$/, message: AUTH_PIN_VALIDATION_MESSAGE },
            ]}
          >
            <Input.Password
              inputMode="numeric"
              maxLength={AUTH_PIN_LENGTH}
              autoComplete="new-password"
              placeholder={t('root.profile.newPinPlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="confirmPin"
            label={t('root.profile.confirmPin')}
            dependencies={['newPin']}
            rules={[
              { required: true, message: t('root.profile.confirmPinRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPin') === value) return Promise.resolve();
                  return Promise.reject(new Error(t('root.profile.pinMismatch')));
                },
              }),
            ]}
          >
            <Input.Password
              inputMode="numeric"
              maxLength={AUTH_PIN_LENGTH}
              autoComplete="new-password"
              placeholder={t('root.profile.confirmPinPlaceholder')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
