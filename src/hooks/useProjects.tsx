import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { archiveProject, createProject, restoreProject, updateProject, type ProjectUpsertInput } from '@/services/projectService';
import type { Project, ProjectStatus } from '@/types';

export type ProjectStatusFilter = ProjectStatus | 'ALL';
export type ProjectActiveFilter = 'active' | 'inactive' | 'all';

export const useProjects = () => {
  const queryClient = useQueryClient();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('ALL');
  const [activeFilter, setActiveFilter] = useState<ProjectActiveFilter>('active');

  const projects = useLiveQuery(
    () => db.projects.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );
  const contacts = useLiveQuery(
    () => db.contacts.orderBy('name').toArray(),
    [],
    [],
  );
  const departments = useLiveQuery(
    () => db.departments.orderBy('name').toArray(),
    [],
    [],
  );

  const activeContacts = useMemo(() => contacts.filter((contact) => contact.is_active), [contacts]);
  const activeDepartments = useMemo(() => departments.filter((department) => department.is_active), [departments]);

  const filteredProjects = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesSearch = !query || [
        project.name,
        project.code,
        project.contact_name,
        project.department_name,
        project.description,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || project.status === statusFilter;
      const matchesActive =
        activeFilter === 'all' ||
        (activeFilter === 'active' ? project.is_active : !project.is_active);

      return matchesSearch && matchesStatus && matchesActive;
    });
  }, [activeFilter, projects, searchText, statusFilter]);

  const invalidateProjects = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: invalidateProjects,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectUpsertInput }) => updateProject(id, input),
    onSuccess: invalidateProjects,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveProject,
    onSuccess: invalidateProjects,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreProject,
    onSuccess: invalidateProjects,
  });

  const resetForm = () => setEditingProject(null);
  const handleEdit = (project: Project) => setEditingProject(project);
  const submitForm = async (input: ProjectUpsertInput) => {
    if (editingProject) {
      return updateMutation.mutateAsync({ id: editingProject.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    projects,
    filteredProjects,
    contacts,
    departments,
    activeContacts,
    activeDepartments,
    editingProject,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    activeFilter,
    setActiveFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveProject: archiveMutation.mutateAsync,
    restoreProject: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
