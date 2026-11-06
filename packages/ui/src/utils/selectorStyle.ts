import { fieldRefKey, getFieldRefValue, type FieldRefLike, type ModuleSchema } from "@repo/types";

type StyleConfig = { hasStyle?: boolean; styleIconField?: FieldRefLike; styleColorField?: FieldRefLike };

export function resolveSelectorStyle(config: StyleConfig, schema?: ModuleSchema) {
  const resolve = (configured: FieldRefLike | undefined, name: "icon" | "color") => {
    if (!config.hasStyle) return undefined;
    if (configured !== undefined) return configured;
    return schema?.fields.some(field => field.name === name && !field.virtual && field.visible !== false) ? name : undefined;
  };
  return {
    styleIconField: resolve(config.styleIconField, "icon"),
    styleColorField: resolve(config.styleColorField, "color"),
  };
}

export function selectorFieldRefs(refs: FieldRefLike[], style: ReturnType<typeof resolveSelectorStyle>) {
  const all = [...refs, style.styleIconField, style.styleColorField].filter((ref): ref is FieldRefLike => ref !== undefined);
  return [...new Map(all.map(ref => [fieldRefKey(ref), ref])).values()];
}

export function readSelectorStyle(row: unknown, style: ReturnType<typeof resolveSelectorStyle>) {
  const read = (ref?: FieldRefLike) => {
    if (ref === undefined) return undefined;
    const value = getFieldRefValue(row, ref);
    return value == null ? undefined : String(value);
  };
  return { icon: read(style.styleIconField), color: read(style.styleColorField) };
}
