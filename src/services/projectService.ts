import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { projectSchema } from '@/lib/validations/project';
import { enqueueProjectSync } from '@/services/syncQueueService';
import type { Project, ProjectStatus } from '@/types';

export interface ProjectUpsertInput {
  name: string;
  code?: string;
  status: ProjectStatus;
  contact_id?: string;
  contact_name?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  start_date?: string;
  end_date?: string;
  budget_amount?: number;
  description?: string;
  is_active?: boolean;
}

type SanitizedProjectInput =
  Required<Pick<ProjectUpsertInput, 'name' | 'status' | 'is_active'>> &
  Omit<ProjectUpsertInput, 'name' | 'status' | 'is_active'>;

const sanitizeProjectInput = (input: ProjectUpsertInput): SanitizedProjectInput => {
  const parsed = projectSchema.parse({
    ...input,
    status: input.status ?? 'ACTIVE',
  });

  return {
    ...parsed,
    code: parsed.code?.toUpperCase(),
    department_code: parsed.department_code?.toUpperCase(),
    budget_amount: parsed.budget_amount === undefined ? undefined : Number(parsed.budget_amount),
    is_active: parsed.is_active ?? true,
  };
};

const assertProjectCodeAvailable = async (code: string | undefined, excludeProjectId?: string) => {
  if (!code) return;

  const existingProject = await db.projects
    .where('code')
    .equals(code)
    .and((project) => project.id !== excludeProjectId && project.is_active)
    .first();

  if (existingProject) {
    throw new Error('Kode project sudah dipakai project aktif lain.');
  }
};

const withPendingSync = (project: Project): Project => ({
  ...project,
  sync_status: 'pending',
  sync_error: undefined,
});

export const createProject = async (input: ProjectUpsertInput): Promise<Project> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const sanitizedInput = sanitizeProjectInput(input);
  await assertProjectCodeAvailable(sanitizedInput.code);

  const now = new Date().toISOString();
  const project: Project = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    created_at: now,
    updated_at: now,
  });

  await db.projects.add(project);
  await writeActivityLog({
    user: currentUser,
    action: 'PROJECT_CREATED',
    entity: 'projects',
    entity_id: project.id,
    description: `${currentUser?.name ?? 'User'} membuat project ${project.name}.`,
  });
  await enqueueProjectSync(project, 'create');

  return project;
};

export const updateProject = async (id: string, input: ProjectUpsertInput): Promise<Project> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const existingProject = await db.projects.get(id);
  if (!existingProject) {
    throw new Error('Project tidak ditemukan.');
  }

  const sanitizedInput = sanitizeProjectInput(input);
  await assertProjectCodeAvailable(sanitizedInput.code, id);

  const updatedProject: Project = withPendingSync({
    ...existingProject,
    ...sanitizedInput,
    updated_at: new Date().toISOString(),
  });

  await db.projects.put(updatedProject);
  await writeActivityLog({
    user: currentUser,
    action: 'PROJECT_UPDATED',
    entity: 'projects',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui project ${updatedProject.name}.`,
  });
  await enqueueProjectSync(updatedProject, 'update');

  return updatedProject;
};

export const archiveProject = async (id: string): Promise<Project> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const project = await db.projects.get(id);
  if (!project) {
    throw new Error('Project tidak ditemukan.');
  }

  const archivedProject: Project = withPendingSync({
    ...project,
    is_active: false,
    updated_at: new Date().toISOString(),
  });

  await db.projects.put(archivedProject);
  await writeActivityLog({
    user: currentUser,
    action: 'PROJECT_ARCHIVED',
    entity: 'projects',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan project ${project.name}.`,
  });
  await enqueueProjectSync(archivedProject, 'delete');

  return archivedProject;
};

export const restoreProject = async (id: string): Promise<Project> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const project = await db.projects.get(id);
  if (!project) {
    throw new Error('Project tidak ditemukan.');
  }

  await assertProjectCodeAvailable(project.code, id);

  const restoredProject: Project = withPendingSync({
    ...project,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await db.projects.put(restoredProject);
  await writeActivityLog({
    user: currentUser,
    action: 'PROJECT_RESTORED',
    entity: 'projects',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan project ${project.name}.`,
  });
  await enqueueProjectSync(restoredProject, 'update');

  return restoredProject;
};
