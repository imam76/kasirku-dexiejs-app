import type { FieldError } from 'react-hook-form';
import type { ReactNode } from 'react';

type FieldContainerProps = {
  label: ReactNode;
  error?: FieldError;
  help?: string;
  required?: boolean;
  requiredLabel?: string;
  children: ReactNode;
};

export default function StockProductFieldContainer({
  label,
  error,
  help,
  required,
  requiredLabel,
  children,
}: FieldContainerProps) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
        <span>{label}</span>
        {required ? (
          <span className="text-sm font-bold leading-none text-red-500" aria-label={requiredLabel} title={requiredLabel}>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error?.message ? <p className="mt-1 text-xs text-red-600">{String(error.message)}</p> : null}
      {!error?.message && help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}
