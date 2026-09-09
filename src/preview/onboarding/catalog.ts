import { SETUP_MODULE_GROUPS } from '@/constants/setupModules';
export { BASE_MODULES, PLAN_IDS, PLAN_CATALOG, getPlan, getPlanModules, type PlanId } from '@/onboarding/catalog';

export const moduleLabel = (code: string) => SETUP_MODULE_GROUPS
  .flatMap((group) => group.modules).find((module) => module.code === code)?.label ?? code;
