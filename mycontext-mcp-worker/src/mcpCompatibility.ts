type JsonObject = Record<string, unknown>;

/**
 * OpenAI Apps require OAuth security schemes on the top-level tool descriptor.
 * MCP SDK 1.29 keeps the same data only in `_meta`, so promote it in the
 * serialized tools/list response until the SDK exposes the field directly.
 */
export async function withOpenAiToolDescriptors(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (!promoteSecuritySchemes(payload)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function promoteSecuritySchemes(payload: unknown): boolean {
  const responses = Array.isArray(payload) ? payload : [payload];
  let changed = false;

  for (const response of responses) {
    if (!isObject(response) || !isObject(response.result) || !Array.isArray(response.result.tools)) {
      continue;
    }

    for (const tool of response.result.tools) {
      if (!isObject(tool) || tool.securitySchemes !== undefined || !isObject(tool._meta)) {
        continue;
      }
      const schemes = tool._meta.securitySchemes;
      if (!Array.isArray(schemes)) {
        continue;
      }
      tool.securitySchemes = schemes;
      changed = true;
    }
  }

  return changed;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
