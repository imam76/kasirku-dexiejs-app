import { useState } from 'react';
import { Button, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';

interface Option {
  value: string;
  label: string;
}

interface LineItemProductPickerProps {
  productId: string;
  productOptions: Option[];
  className?: string;
  onSelectProduct: (productId: string) => void;
  onCreateProductRequest?: (search: string) => void;
}

export const LineItemProductPicker = ({
  productId,
  productOptions,
  className,
  onSelectProduct,
  onCreateProductRequest,
}: LineItemProductPickerProps) => {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [productSearch, setProductSearch] = useState('');

  return (
    <Select
      size={isMobile ? 'large' : undefined}
      showSearch={{ optionFilterProp: 'label' }}
      className={className ?? 'w-full min-w-0'}
      placeholder={t('salesDocuments.placeholder.product')}
      value={productId || undefined}
      options={productOptions}
      onSearch={setProductSearch}
      searchValue={productSearch}
      notFoundContent={
        productSearch.trim().length > 0 ? (
          <div className="px-2 py-2">
            <div className="mb-2 text-sm text-gray-600">
              {t('salesDocuments.quickCreate.notFound')}
            </div>
            <Button
              type="primary"
              size="small"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreateProductRequest?.(productSearch);
                setProductSearch('');
              }}
            >
              {t('salesDocuments.quickCreate.action')}
            </Button>
          </div>
        ) : null
      }
      onChange={(nextProductId: string) => {
        onSelectProduct(nextProductId);
        setProductSearch('');
      }}
    />
  );
};
