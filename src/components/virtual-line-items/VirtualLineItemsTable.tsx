import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualRowRenderContext {
  virtualIndex: number;
  style: CSSProperties;
  measureRef: (node: HTMLDivElement | null) => void;
}

interface VirtualLineItemsTableProps<T> {
  rows: T[];
  getRowKey: (row: T) => string;
  estimateRowSize: (row: T | undefined) => number;
  remeasureSignature?: string;
  scrollToLastRequest?: number;
  minWidth: number;
  header: ReactNode;
  emptyState: ReactNode;
  outerClassName?: string;
  scrollContainerClassName?: string;
  // The element receiving context.measureRef must also carry data-index={context.virtualIndex};
  // the virtualizer reads that attribute to know which row it measured.
  renderRow: (row: T, context: VirtualRowRenderContext) => ReactNode;
}

export const VirtualLineItemsTable = <T,>({
  rows,
  getRowKey,
  estimateRowSize,
  remeasureSignature,
  scrollToLastRequest = 0,
  minWidth,
  header,
  emptyState,
  outerClassName = 'overflow-hidden rounded border border-gray-200',
  scrollContainerClassName = 'max-h-[640px] min-h-[360px] overflow-auto',
  renderRow,
}: VirtualLineItemsTableProps<T>) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowElementsRef = useRef(new Map<string, HTMLDivElement>());

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => (rows[index] !== undefined ? getRowKey(rows[index]) : index),
    estimateSize: (index) => estimateRowSize(rows[index]),
    overscan: 10,
  });

  useLayoutEffect(() => {
    const measureMountedRows = () => {
      rowElementsRef.current.forEach((node) => {
        rowVirtualizer.measureElement(node);
      });
    };

    measureMountedRows();
    const frameId = window.requestAnimationFrame(measureMountedRows);

    return () => window.cancelAnimationFrame(frameId);
  }, [remeasureSignature, rowVirtualizer]);

  useEffect(() => {
    if (!scrollToLastRequest || rows.length === 0) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [rows.length, rowVirtualizer, scrollToLastRequest]);

  return (
    <div className={outerClassName}>
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          {header}

          <div ref={parentRef} className={scrollContainerClassName}>
            {rows.length === 0 ? emptyState : (
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (row === undefined) return null;

                  const rowKey = getRowKey(row);
                  const measureRef = (node: HTMLDivElement | null) => {
                    if (node) {
                      rowElementsRef.current.set(rowKey, node);
                      rowVirtualizer.measureElement(node);
                      return;
                    }

                    rowElementsRef.current.delete(rowKey);
                  };

                  return (
                    <Fragment key={virtualRow.key}>
                      {renderRow(row, {
                        virtualIndex: virtualRow.index,
                        style: {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        },
                        measureRef,
                      })}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
