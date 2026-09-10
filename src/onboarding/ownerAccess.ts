import { getCurrentSessionUser } from '@/auth/authService';
import { db } from '@/lib/db';
import { isOwnerAccessContext } from '@/services/setupKeyService';

export async function requireSubscriptionOwner() {
  const user = await getCurrentSessionUser();
  const role = user?.role_id ? await db.roles.get(user.role_id) : undefined;
  if (!user?.is_active || !isOwnerAccessContext(user, role)) {
    throw new Error('Hanya Owner yang dapat mengelola identitas langganan.');
  }
  return user;
}
