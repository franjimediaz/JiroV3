import type { ModuleUiSchema } from "./fields";

/** Merge one appearance change without replacing the rest of the module config. */
export function applyModuleUiPatch<T extends { ui?: ModuleUiSchema }>(
  props: T,
  patch: Partial<ModuleUiSchema>,
): T {
  return { ...props, ui: { ...props.ui, ...patch } };
}
