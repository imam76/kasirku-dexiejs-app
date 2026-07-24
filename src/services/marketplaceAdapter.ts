import { invoke } from '@tauri-apps/api/core';
import { getCurrentServerSessionToken } from '@/auth/authService';
import { isTauriRuntime } from '@/utils/export/platform';

export type MarketplaceAccountStatus = 'CONNECTED' | 'REAUTH_REQUIRED' | 'RESTRICTED';
export type MarketplaceInternalStatus =
  | 'WAITING_PAYMENT'
  | 'READY_TO_PROCESS'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MarketplaceAccountDto {
  id: string;
  marketplace: string;
  shop_id: string;
  shop_name: string;
  status: MarketplaceAccountStatus;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceOrderDto {
  id: string;
  marketplace_account_id: string;
  shop_name: string;
  shop_id: string;
  order_sn: string;
  buyer_username?: string | null;
  marketplace_status: string;
  internal_status: MarketplaceInternalStatus;
  total_amount?: string | null;
  currency: string;
  order_created_at: string;
  order_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceOrderItemDto {
  id: string;
  marketplace_order_id: string;
  item_id: string;
  model_id: string;
  item_name: string;
  sku?: string | null;
  quantity: number;
  original_price?: string | null;
  discounted_price?: string | null;
}

export interface MarketplaceOrderBundleDto {
  order: MarketplaceOrderDto;
  items: MarketplaceOrderItemDto[];
}

export interface MarketplaceOrderListInput {
  accountId?: string;
  search?: string;
  internalStatus?: MarketplaceInternalStatus;
  limit?: number;
  offset?: number;
}

export interface MarketplaceOrderListResult {
  rows: MarketplaceOrderDto[];
  total: number;
}

export interface MarketplaceIntegrationLogDto {
  id: string;
  marketplace_account_id?: string | null;
  action: string;
  status: 'SUCCESS' | 'FAILED';
  request_payload?: unknown;
  response_payload?: unknown;
  error_message?: string | null;
  created_at: string;
}

export interface MarketplaceSyncSummary {
  marketplace_account_id: string;
  fetched_orders: number;
  upserted_orders: number;
  upserted_items: number;
  synced_at: string;
}

export interface ShopeeAuthorizationAttemptDto {
  attempt_id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  expires_at: string;
  message?: string | null;
  marketplace_account_id?: string | null;
}

const requireDesktopSession = async (): Promise<string> => {
  if (!isTauriRuntime()) {
    throw new Error('Integrasi Marketplace hanya tersedia di aplikasi desktop Frayukti.');
  }
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) {
    throw new Error('Sesi server sudah berakhir. Silakan login kembali.');
  }
  return sessionToken;
};

export const marketplaceAdapter = {
  async listAccounts(): Promise<MarketplaceAccountDto[]> {
    const sessionToken = await requireDesktopSession();
    return invoke('marketplace_list_accounts', { sessionToken });
  },

  async startShopeeAuthorization(): Promise<ShopeeAuthorizationAttemptDto> {
    const sessionToken = await requireDesktopSession();
    return invoke('shopee_start_authorization', { sessionToken });
  },

  async getShopeeAuthorizationStatus(attemptId: string): Promise<ShopeeAuthorizationAttemptDto> {
    const sessionToken = await requireDesktopSession();
    return invoke('shopee_get_authorization_status', { sessionToken, attemptId });
  },

  async syncOrders(marketplaceAccountId: string): Promise<MarketplaceSyncSummary> {
    const sessionToken = await requireDesktopSession();
    return invoke('marketplace_sync_orders', { sessionToken, marketplaceAccountId });
  },

  async listOrders(input: MarketplaceOrderListInput): Promise<MarketplaceOrderListResult> {
    const sessionToken = await requireDesktopSession();
    return invoke('marketplace_list_orders', { sessionToken, input });
  },

  async getOrder(id: string): Promise<MarketplaceOrderBundleDto> {
    const sessionToken = await requireDesktopSession();
    return invoke('marketplace_get_order', { sessionToken, id });
  },

  async listIntegrationLogs(
    marketplaceAccountId?: string,
    limit = 20,
  ): Promise<MarketplaceIntegrationLogDto[]> {
    const sessionToken = await requireDesktopSession();
    return invoke('marketplace_list_integration_logs', {
      sessionToken,
      marketplaceAccountId,
      limit,
    });
  },
};

export const marketplaceErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Terjadi kesalahan pada integrasi Marketplace.';
};
