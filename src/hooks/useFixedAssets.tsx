import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveFixedAsset,
  createDepreciationRunDraft,
  createFixedAsset,
  deleteDepreciationRunDraft,
  postDepreciationRun,
  previewDepreciationRun,
  restoreFixedAsset,
  reverseDepreciationRun,
  updateFixedAsset,
  type FixedAssetUpsertInput,
} from '@/services/fixedAssetService';
import { calculateDepreciationForPeriod, calculateFixedAssetPosition, type FixedAssetPostedLine } from '@/utils/fixedAssets/calculateDepreciation';
import type {
  FixedAsset,
  FixedAssetCategory,
  FixedAssetDepreciationRunStatus,
  FixedAssetDerivedStatus,
} from '@/types';

export type FixedAssetActivityFilter = 'active' | 'archived' | 'all';
export type FixedAssetRunStatusFilter = FixedAssetDepreciationRunStatus | 'ALL';

export const useFixedAssets = () => {
  const queryClient = useQueryClient();
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FixedAssetCategory | 'ALL'>('ALL');
  const [derivedStatusFilter, setDerivedStatusFilter] = useState<FixedAssetDerivedStatus | 'ALL'>('ALL');
  const [activityFilter, setActivityFilter] = useState<FixedAssetActivityFilter>('active');
  const [departmentFilter, setDepartmentFilter] = useState<string>();
  const [projectFilter, setProjectFilter] = useState<string>();
  const [assetAccountFilter, setAssetAccountFilter] = useState<string>();
  const [availableDateRange, setAvailableDateRange] = useState<[string?, string?]>([]);
  const [runSearch, setRunSearch] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<FixedAssetRunStatusFilter>('ALL');
  const [runPeriodRange, setRunPeriodRange] = useState<[string?, string?]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>();

  const assets = useLiveQuery(() => db.fixedAssets.orderBy('asset_code').toArray(), [], []);
  const runs = useLiveQuery(() => db.fixedAssetDepreciationRuns.toArray(), [], []);
  const runLines = useLiveQuery(() => db.fixedAssetDepreciationRunLines.toArray(), [], []);
  const accounts = useLiveQuery(() => db.chartOfAccounts.orderBy('code').toArray(), [], []);
  const departments = useLiveQuery(() => db.departments.orderBy('name').toArray(), [], []);
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), [], []);
  const periods = useLiveQuery(() => db.accountingPeriods.orderBy('end_date').toArray(), [], []);
  const journalEntries = useLiveQuery(() => db.journalEntries.toArray(), [], []);

  const openMonthlyPeriods = useMemo(() => periods
    .filter((period) => !period.deleted_at && period.period_type === 'MONTHLY' && period.status === 'OPEN')
    .sort((left, right) => left.end_date.localeCompare(right.end_date)), [periods]);

  const effectiveSelectedPeriodId = selectedPeriodId ?? openMonthlyPeriods[0]?.id;

  const postedLines = useMemo<FixedAssetPostedLine[]>(() => {
    const runById = new Map(runs.filter((run) => !run.deleted_at && run.status !== 'DRAFT').map((run) => [run.id, run]));
    return runLines.flatMap((line): FixedAssetPostedLine[] => {
      const run = runById.get(line.run_id);
      return run ? [{ asset_id: line.asset_id, depreciation_amount: line.depreciation_amount, period_id: run.period_id, period_end: run.period_end, run_status: run.status }] : [];
    });
  }, [runLines, runs]);

  const assetRows = useMemo(() => assets.filter((asset) => !asset.deleted_at).map((asset) => ({
    asset,
    position: calculateFixedAssetPosition(asset, postedLines, new Date().toISOString().slice(0, 10)),
  })), [assets, postedLines]);

  const filteredAssetRows = useMemo(() => {
    const search = assetSearch.trim().toLowerCase();
    return assetRows.filter(({ asset, position }) => (
      (!search || [asset.asset_code, asset.name, asset.location].some((value) => value?.toLowerCase().includes(search))) &&
      (categoryFilter === 'ALL' || asset.category === categoryFilter) &&
      (derivedStatusFilter === 'ALL' || position.derivedStatus === derivedStatusFilter) &&
      (activityFilter === 'all' || (activityFilter === 'active' ? asset.is_active : !asset.is_active)) &&
      (!departmentFilter || asset.department_id === departmentFilter) &&
      (!projectFilter || asset.project_id === projectFilter) &&
      (!assetAccountFilter || asset.asset_account_id === assetAccountFilter) &&
      (!availableDateRange[0] || asset.available_for_use_date >= availableDateRange[0]) &&
      (!availableDateRange[1] || asset.available_for_use_date <= availableDateRange[1])
    ));
  }, [activityFilter, assetAccountFilter, assetRows, assetSearch, availableDateRange, categoryFilter, departmentFilter, derivedStatusFilter, projectFilter]);

  const filteredRuns = useMemo(() => {
    const search = runSearch.trim().toLowerCase();
    return runs.filter((run) => !run.deleted_at &&
      (!search || [run.run_number, run.period_name].some((value) => value.toLowerCase().includes(search))) &&
      (runStatusFilter === 'ALL' || run.status === runStatusFilter) &&
      (!runPeriodRange[0] || run.period_end >= runPeriodRange[0]) &&
      (!runPeriodRange[1] || run.period_start <= runPeriodRange[1]))
      .sort((left, right) => right.period_end.localeCompare(left.period_end) || right.created_at.localeCompare(left.created_at));
  }, [runPeriodRange, runSearch, runStatusFilter, runs]);

  const selectedPeriod = periods.find((period) => period.id === effectiveSelectedPeriodId);
  const selectedPeriodPostedRun = runs.find((run) => !run.deleted_at && run.period_id === effectiveSelectedPeriodId && run.status === 'POSTED');
  const selectedPeriodPreviewTotal = selectedPeriod
    ? filteredAssetRows.reduce((sum, row) => sum + calculateDepreciationForPeriod(row.asset, postedLines, selectedPeriod).depreciationAmount, 0)
    : 0;
  const summary = useMemo(() => ({
    acquisitionCost: filteredAssetRows.reduce((sum, row) => sum + row.asset.acquisition_cost, 0),
    accumulatedDepreciation: filteredAssetRows.reduce((sum, row) => sum + row.position.accumulatedDepreciation, 0),
    bookValue: filteredAssetRows.reduce((sum, row) => sum + row.position.bookValue, 0),
    periodDepreciation: selectedPeriodPostedRun?.total_depreciation ?? selectedPeriodPreviewTotal,
    periodPosted: Boolean(selectedPeriodPostedRun),
  }), [filteredAssetRows, selectedPeriodPostedRun, selectedPeriodPreviewTotal]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['fixedAssets'] });
    queryClient.invalidateQueries({ queryKey: ['fixedAssetDepreciationRuns'] });
    queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    queryClient.invalidateQueries({ queryKey: ['closingPreview'] });
  };
  const createMutation = useMutation({ mutationFn: createFixedAsset, onSuccess: invalidate });
  const updateMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: FixedAssetUpsertInput }) => updateFixedAsset(id, input), onSuccess: invalidate });
  const archiveMutation = useMutation({ mutationFn: archiveFixedAsset, onSuccess: invalidate });
  const restoreMutation = useMutation({ mutationFn: restoreFixedAsset, onSuccess: invalidate });
  const draftMutation = useMutation({ mutationFn: ({ periodId, notes }: { periodId: string; notes?: string }) => createDepreciationRunDraft(periodId, notes), onSuccess: invalidate });
  const previewMutation = useMutation({ mutationFn: previewDepreciationRun });
  const deleteDraftMutation = useMutation({ mutationFn: deleteDepreciationRunDraft, onSuccess: invalidate });
  const postMutation = useMutation({ mutationFn: postDepreciationRun, onSuccess: invalidate });
  const reverseMutation = useMutation({ mutationFn: ({ runId, reason }: { runId: string; reason: string }) => reverseDepreciationRun(runId, reason), onSuccess: invalidate });

  return {
    assets, assetRows, filteredAssetRows, runs, filteredRuns, runLines, accounts, departments, projects,
    periods, openMonthlyPeriods, journalEntries, postedLines, summary, selectedPeriod, selectedPeriodId: effectiveSelectedPeriodId, setSelectedPeriodId,
    editingAsset, setEditingAsset, assetSearch, setAssetSearch, categoryFilter, setCategoryFilter,
    derivedStatusFilter, setDerivedStatusFilter, activityFilter, setActivityFilter,
    departmentFilter, setDepartmentFilter, projectFilter, setProjectFilter,
    assetAccountFilter, setAssetAccountFilter, availableDateRange, setAvailableDateRange,
    runSearch, setRunSearch, runStatusFilter, setRunStatusFilter,
    runPeriodRange, setRunPeriodRange,
    saveAsset: (input: FixedAssetUpsertInput) => editingAsset
      ? updateMutation.mutateAsync({ id: editingAsset.id, input })
      : createMutation.mutateAsync(input),
    archiveAsset: archiveMutation.mutateAsync,
    restoreAsset: restoreMutation.mutateAsync,
    createDraft: draftMutation.mutateAsync,
    previewDraft: previewMutation.mutateAsync,
    deleteDraft: deleteDraftMutation.mutateAsync,
    postRun: postMutation.mutateAsync,
    reverseRun: reverseMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isProcessing: archiveMutation.isPending || restoreMutation.isPending || draftMutation.isPending || deleteDraftMutation.isPending || postMutation.isPending || reverseMutation.isPending,
    isPreviewing: previewMutation.isPending,
  };
};
