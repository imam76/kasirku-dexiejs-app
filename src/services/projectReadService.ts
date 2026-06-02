import { db } from '@/lib/db';
import { isTauriRuntime, projectPostgresAdapter, type RemoteProjectDto } from '@/services/postgresAdapter';
import type { Project, ProjectStatus } from '@/types';

export interface ProjectReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_PROJECT_READ_SYNC_RESULT: ProjectReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingProjectsFromPostgres = false;

const isProjectStatus = (status: string): status is ProjectStatus => (
  ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].includes(status)
);

const mapRemoteProjectToLocal = (
  remoteProject: RemoteProjectDto,
  syncedAt: string,
): Project => ({
  id: remoteProject.id,
  name: remoteProject.name,
  code: remoteProject.code ?? undefined,
  status: isProjectStatus(remoteProject.status) ? remoteProject.status : 'ACTIVE',
  contact_id: remoteProject.contact_id ?? undefined,
  contact_name: remoteProject.contact_name ?? undefined,
  department_id: remoteProject.department_id ?? undefined,
  department_code: remoteProject.department_code ?? undefined,
  department_name: remoteProject.department_name ?? undefined,
  start_date: remoteProject.start_date ?? undefined,
  end_date: remoteProject.end_date ?? undefined,
  budget_amount: remoteProject.budget_amount ?? undefined,
  description: remoteProject.description ?? undefined,
  is_active: remoteProject.deleted_at ? false : remoteProject.is_active,
  created_at: remoteProject.created_at,
  updated_at: remoteProject.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteProject.updated_at,
});

const hasLocalUnsyncedChanges = (project: Project) => (
  project.sync_status === 'pending' || project.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteProject = (
  localProject: Project | undefined,
  remoteProject: RemoteProjectDto,
) => {
  if (!localProject) return true;
  if (hasLocalUnsyncedChanges(localProject)) return false;

  const localRemoteUpdatedAt = localProject.remote_updated_at ?? localProject.updated_at;
  const remoteTimestamp = toTimestamp(remoteProject.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteProject.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteProjectsIntoDexie = async (
  remoteProjects: RemoteProjectDto[],
  syncedAt = new Date().toISOString(),
): Promise<ProjectReadSyncResult> => {
  const result: ProjectReadSyncResult = {
    ...EMPTY_PROJECT_READ_SYNC_RESULT,
    fetched: remoteProjects.length,
  };
  if (remoteProjects.length === 0) return result;

  const projectsToPut: Project[] = [];

  await db.transaction('rw', db.projects, async () => {
    for (const remoteProject of remoteProjects) {
      const localProject = await db.projects.get(remoteProject.id);
      if (!shouldApplyRemoteProject(localProject, remoteProject)) {
        result.skipped += 1;
        continue;
      }

      projectsToPut.push(mapRemoteProjectToLocal(remoteProject, syncedAt));
      if (localProject) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (projectsToPut.length > 0) {
      await db.projects.bulkPut(projectsToPut);
    }
  });

  return result;
};

export const refreshProjectsFromPostgres = async (): Promise<ProjectReadSyncResult> => {
  if (isRefreshingProjectsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PROJECT_READ_SYNC_RESULT };
  }

  isRefreshingProjectsFromPostgres = true;
  try {
    const remoteProjects = await projectPostgresAdapter.list();
    return mergeRemoteProjectsIntoDexie(remoteProjects);
  } finally {
    isRefreshingProjectsFromPostgres = false;
  }
};
