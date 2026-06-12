import { useState } from 'react';
import dayjs from '@/lib/dayjs';

export function useDateFilter(defaultHelper = 'today') {
  const getInitialRange = (helper: string): [dayjs.Dayjs | null, dayjs.Dayjs | null] | null => {
    switch (helper) {
      case 'today':
        return [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
      case 'yesterday':
        return [dayjs.tz().subtract(1, 'day').startOf('day'), dayjs.tz().subtract(1, 'day').endOf('day')];
      case 'this-week':
        return [dayjs.tz().startOf('week').add(1, 'day'), dayjs.tz().endOf('day')];
      case 'last-week':
        return [
          dayjs.tz().subtract(1, 'week').startOf('week').add(1, 'day'),
          dayjs.tz().subtract(1, 'week').endOf('week').add(1, 'day'),
        ];
      case 'this-month':
        return [dayjs.tz().startOf('month'), dayjs.tz().endOf('day')];
      case 'last-month':
        return [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
      default:
        return null;
    }
  };

  const initialRange = getInitialRange(defaultHelper);

  const [startDate, setStartDate] = useState<string | undefined>(
    initialRange?.[0] ? initialRange[0].format('YYYY-MM-DD') : undefined
  );
  const [endDate, setEndDate] = useState<string | undefined>(
    initialRange?.[1] ? initialRange[1].format('YYYY-MM-DD') : undefined
  );
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(initialRange);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>(defaultHelper);

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') {
      setSelectedHelper('custom');
    }
    if (dates && dates[0] && dates[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);
    let range: [dayjs.Dayjs, dayjs.Dayjs] | null = null;

    switch (value) {
      case 'today':
        range = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
        break;
      case 'yesterday':
        range = [dayjs.tz().subtract(1, 'day').startOf('day'), dayjs.tz().subtract(1, 'day').endOf('day')];
        break;
      case 'this-week':
        range = [dayjs.tz().startOf('week').add(1, 'day'), dayjs.tz().endOf('day')];
        break;
      case 'last-week':
        range = [
          dayjs.tz().subtract(1, 'week').startOf('week').add(1, 'day'),
          dayjs.tz().subtract(1, 'week').endOf('week').add(1, 'day'),
        ];
        break;
      case 'this-month':
        range = [dayjs.tz().startOf('month'), dayjs.tz().endOf('day')];
        break;
      case 'last-month':
        range = [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
        break;
      case 'custom':
        return;
      default:
        range = null;
    }

    if (range) {
      setDateRange(range);
      setStartDate(range[0].format('YYYY-MM-DD'));
      setEndDate(range[1].format('YYYY-MM-DD'));
    } else {
      setDateRange(null);
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const resetDate = () => {
    const todayRange = getInitialRange(defaultHelper);
    setDateRange(todayRange);
    setStartDate(todayRange?.[0] ? todayRange[0].format('YYYY-MM-DD') : undefined);
    setEndDate(todayRange?.[1] ? todayRange[1].format('YYYY-MM-DD') : undefined);
    setSelectedHelper(defaultHelper);
  };

  return {
    startDate,
    endDate,
    dateRange,
    selectedHelper,
    setSelectedHelper,
    handleDateRangeChange,
    handleHelperChange,
    resetDate,
  };
}
