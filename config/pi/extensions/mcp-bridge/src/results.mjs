function compact(value) {
  try {
    const json = JSON.stringify(value);
    return json.length > 2000 ? `${json.slice(0, 1997)}...` : json;
  } catch {
    return String(value);
  }
}

export function normalizeMcpResult(response) {
  const rawContent = Array.isArray(response?.content) ? response.content : [];
  const parts = rawContent.map((item) => {
    if (item?.type === "text" && typeof item.text === "string") return item.text;
    return compact(item);
  });
  const text = parts.length > 0 ? parts.join("\n") : compact(response ?? {});
  return {
    content: [{ type: "text", text }],
    details: { rawMcpResponse: response },
    isError: response?.isError === true,
  };
}

export function normalizeMcpError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `MCP tool error: ${message}` }],
    details: { error: message },
    isError: true,
  };
}
