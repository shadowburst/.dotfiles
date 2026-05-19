const GENERIC_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {},
};

function primitive(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const out = {};
  if (typeof schema.description === "string") out.description = schema.description;
  if (typeof schema.title === "string") out.title = schema.title;
  if (Array.isArray(schema.enum) && schema.enum.every((v) => ["string", "number", "boolean"].includes(typeof v))) out.enum = schema.enum;

  if (["string", "number", "integer", "boolean", "null"].includes(schema.type)) return { ...out, type: schema.type };
  if (schema.type === "array") {
    const item = convertNode(schema.items ?? {}, 1);
    if (!item) return undefined;
    return { ...out, type: "array", items: item };
  }
  if (schema.type === "object" || schema.properties) return convertObject(schema, 1);
  return undefined;
}

function convertNode(schema, depth) {
  if (depth > 8) return undefined;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (schema.anyOf || schema.oneOf || schema.allOf || schema.not || schema.$ref) return undefined;
  return primitive(schema);
}

function convertObject(schema, depth = 0) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (schema.anyOf || schema.oneOf || schema.allOf || schema.not || schema.$ref) return undefined;
  const properties = {};
  const rawProperties = schema.properties ?? {};
  if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) return undefined;
  for (const [name, child] of Object.entries(rawProperties)) {
    const converted = convertNode(child, depth + 1);
    if (!converted) return undefined;
    properties[name] = converted;
  }
  const out = { type: "object", properties };
  if (typeof schema.description === "string") out.description = schema.description;
  if (Array.isArray(schema.required) && schema.required.every((field) => typeof field === "string")) out.required = schema.required;
  if (typeof schema.additionalProperties === "boolean") out.additionalProperties = schema.additionalProperties;
  return out;
}

export function convertMcpInputSchema(schema) {
  if (schema === undefined || schema === null) return { schema: GENERIC_OBJECT_SCHEMA, fallback: true, reason: "missing input schema" };
  const converted = convertObject(schema);
  if (converted) return { schema: converted, fallback: false };
  return { schema: GENERIC_OBJECT_SCHEMA, fallback: true, reason: "unsupported JSON Schema features" };
}
