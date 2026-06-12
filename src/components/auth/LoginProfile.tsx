import { useMemo, useState } from 'react';
import { Avatar, Button, Divider, Popover, Space, Tag, Typography } from 'antd';
import { ChevronDown, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { AuthUser, Role } from '@/types';
import { buildAuthUserProfileSummary } from '@/utils/auth/profileDisplay';

const { Text } = Typography;

interface LoginProfileProps {
  currentUser: AuthUser | null;
  currentRole: Role | null;
  onLogout: () => void;
}

export default function LoginProfile({ currentUser, currentRole, onLogout }: LoginProfileProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
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

      <Button danger block icon={<LogOut size={16} />} onClick={handleLogout}>
        {t('root.logout')}
      </Button>
    </div>
  );

  return (
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
  );
}
