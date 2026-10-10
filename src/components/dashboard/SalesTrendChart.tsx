import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts-for-react';
import { Empty, Skeleton, theme as antdTheme } from 'antd';
import { formatCurrency } from '@/utils/formatters';

echarts.use([GridComponent, LineChart, SVGRenderer, TooltipComponent]);

export interface SalesTrendBucket {
  date: string;
  label: string;
  totalRevenue: number;
  transactionCount: number;
}

interface SalesTrendChartProps {
  buckets: SalesTrendBucket[];
  loading: boolean;
}

const formatCompactCurrency = (value: number) => {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  }

  if (absoluteValue >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  }

  if (absoluteValue >= 1_000) {
    return `${(value / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  }

  return formatCurrency(value);
};

export default function SalesTrendChart({ buckets, loading }: SalesTrendChartProps) {
  const { token } = antdTheme.useToken();
  const hasSales = buckets.some((bucket) => bucket.totalRevenue > 0);
  const chartOption = useMemo<EChartsOption>(() => ({
    animationDuration: 350,
    backgroundColor: 'transparent',
    color: [token.colorPrimary],
    grid: {
      bottom: 26,
      containLabel: true,
      left: 8,
      right: 12,
      top: 18,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: token.colorBgElevated,
      borderColor: token.colorBorderSecondary,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: 12,
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: token.colorPrimary,
          opacity: 0.32,
          width: 1,
        },
      },
      formatter: (params: Array<{
        axisValueLabel?: string;
        data?: { transactionCount?: number; value?: number };
        marker?: string;
        name?: string;
      }> | {
        axisValueLabel?: string;
        data?: { transactionCount?: number; value?: number };
        marker?: string;
        name?: string;
      }) => {
        const item = Array.isArray(params) ? params[0] : params;
        const revenue = Number(item.data?.value ?? 0);
        const transactionCount = Number(item.data?.transactionCount ?? 0);
        const label = item.axisValueLabel ?? item.name ?? '';

        return [
          `<div style="font-weight:600;margin-bottom:4px;">${label}</div>`,
          `<div>${item.marker ?? ''}Rp ${formatCurrency(revenue)}</div>`,
          `<div style="color:${token.colorTextSecondary};font-size:12px;margin-top:2px;">${transactionCount} transaksi</div>`,
        ].join('');
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: buckets.map((bucket) => bucket.label),
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: token.colorBorderSecondary,
        },
      },
      axisLabel: {
        color: token.colorTextTertiary,
        fontFamily: token.fontFamily,
        fontSize: 10,
        hideOverlap: true,
        margin: 10,
        showMaxLabel: true,
        showMinLabel: true,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 3,
      axisLabel: {
        color: token.colorTextTertiary,
        fontFamily: token.fontFamily,
        fontSize: 10,
        formatter: (value: number) => `Rp ${formatCompactCurrency(value)}`,
      },
      splitLine: {
        lineStyle: {
          color: token.colorBorderSecondary,
          opacity: 0.9,
        },
      },
    },
    series: [
      {
        name: 'Penjualan',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: token.colorPrimary,
          width: 3,
        },
        itemStyle: {
          borderColor: token.colorBgContainer,
          borderWidth: 2,
          color: token.colorPrimary,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: token.colorPrimary },
              { offset: 1, color: token.colorBgContainer },
            ],
          },
          opacity: 0.18,
        },
        emphasis: {
          focus: 'series',
        },
        data: buckets.map((bucket) => ({
          transactionCount: bucket.transactionCount,
          value: bucket.totalRevenue,
        })),
      },
    ],
  }), [
    buckets,
    token.colorBgContainer,
    token.colorBgElevated,
    token.colorBorderSecondary,
    token.colorPrimary,
    token.colorText,
    token.colorTextSecondary,
    token.colorTextTertiary,
    token.fontFamily,
  ]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  }

  return (
    <div className="flex h-full min-h-[180px] items-stretch">
      {!hasSales ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada penjualan" />
        </div>
      ) : (
        <ReactEChartsCore
          echarts={echarts}
          option={chartOption}
          className="min-h-[180px] flex-1"
          style={{ height: '100%', minHeight: 180, width: '100%' }}
          notMerge
          lazyUpdate
          opts={{ renderer: 'svg' }}
        />
      )}
    </div>
  );
}
