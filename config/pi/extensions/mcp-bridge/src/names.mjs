export function sanitizeName(value) {
  const sanitized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const nonEmpty = sanitized || "unnamed";
  return /^[a-z_]/.test(nonEmpty) ? nonEmpty : `x_${nonEmpty}`;
}

export function piToolName(serverName, toolName) {
  return `mcp_${sanitizeName(serverName)}_${sanitizeName(toolName)}`;
}
