import type { Product, StockMutation, StockMutationSourceType, UserRole } from '@/types';
import { enqueueStockMutationSync } from '@/services/syncQueueService';

interface StockMutationActor {
  id?: string;
  name?: string;
  role?: UserRole;
}

export interface CreateStockMutationInput {
  product: Pick<Product, 'id' | 'name' | 'sku' | 'purchase_unit'>;
  warehouse?: {
    id?: string;
    code?: string;
    name?: string;
  };
  sourceType: StockMutationSourceType;
  sourceId: string;
  sourceNumber?: string;
  sourceLineId: string;
  quantityDelta: number;
  sourceQuantity?: number;
  sourceUnit?: string;
  reason?: string;
  actor?: StockMutationActor | null;
  occurredAt: string;
}

const buildStockMutationId = (
  sourceType: StockMutationSourceType,
  sourceId: string,
  sourceLineId: string,
) => `${sourceType}:${sourceId}:${sourceLineId}`;

export const createStockMutation = ({
  product,
  warehouse,
  sourceType,
  sourceId,
  sourceNumber,
  sourceLineId,
  quantityDelta,
  sourceQuantity,
  sourceUnit,
  reason,
  actor,
  occurredAt,
}: CreateStockMutationInput): StockMutation => ({
  id: buildStockMutationId(sourceType, sourceId, sourceLineId),
  product_id: product.id,
  product_name: product.name,
  sku: product.sku,
  warehouse_id: warehouse?.id,
  warehouse_code: warehouse?.code,
  warehouse_name: warehouse?.name,
  source_type: sourceType,
  source_id: sourceId,
  source_number: sourceNumber,
  source_line_id: sourceLineId,
  quantity_delta: quantityDelta,
  unit: product.purchase_unit,
  stock_unit: product.purchase_unit,
  source_quantity: sourceQuantity,
  source_unit: sourceUnit,
  reason,
  actor_user_id: actor?.id,
  actor_user_name: actor?.name,
  occurred_at: occurredAt,
  created_at: occurredAt,
});

export const enqueueStockMutations = async (mutations: StockMutation[]) => {
  for (const mutation of mutations) {
    await enqueueStockMutationSync(mutation);
  }
};
