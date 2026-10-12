// Only serving string maxima are omitted: the installed compiler expands them
// into costly finite repetition. Full instructions and bounded binders retain them.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function servingSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const projected = structuredClone(schema);
  function visit(value: unknown) {
    if (!record(value)) return;
    delete value.maxLength;
    // Visit schema positions, never enum/default/const literal data or property names.
    for (const key of ['properties', '$defs', 'definitions']) {
      const map = value[key];
      if (record(map)) for (const child of Object.values(map)) visit(child);
    }
    for (const key of ['items', 'additionalProperties']) visit(value[key]);
    for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
      const children = value[key];
      if (Array.isArray(children)) for (const child of children) visit(child);
    }
  }
  visit(projected);
  return projected;
}
