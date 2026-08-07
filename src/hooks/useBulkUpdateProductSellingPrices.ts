import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkUpdateProductSellingPrices } from '@/services/productUpdateService';

interface BulkUpdateSellingPricesInput {
  updates: Array<{ productId: string; sellingPrice: number }>;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
}

export const useBulkUpdateProductSellingPrices = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const mutation = useMutation({
    mutationFn: ({ updates, sourceDocumentId, sourceDocumentNumber }: BulkUpdateSellingPricesInput) => (
      bulkUpdateProductSellingPrices(updates, { sourceDocumentId, sourceDocumentNumber })
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success('Harga jual produk berhasil diperbarui.');
    },
    onError: (error: Error) => {
      modal.error({ title: 'Update harga jual gagal', content: error.message });
    },
  });

  return {
    bulkUpdateSellingPrices: mutation.mutateAsync,
    isUpdatingSellingPrices: mutation.isPending,
  };
};
