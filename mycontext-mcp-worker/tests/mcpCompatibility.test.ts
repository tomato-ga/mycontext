import { describe, expect, it } from "vitest";
import { promoteSecuritySchemes, withOpenAiToolDescriptors } from "../src/mcpCompatibility.js";

describe("OpenAI tool descriptor compatibility", () => {
  it("promotes OAuth security schemes from _meta to tools/list descriptors", () => {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [{
          name: "health_check",
          _meta: { securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] }
        }]
      }
    };

    expect(promoteSecuritySchemes(payload)).toBe(true);
    expect(payload.result.tools[0]).toMatchObject({
      securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }]
    });
  });

  it("does not overwrite an SDK-provided top-level descriptor", () => {
    const payload = {
      result: {
        tools: [{
          name: "health_check",
          securitySchemes: [{ type: "noauth" }],
          _meta: { securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] }
        }]
      }
    };

    expect(promoteSecuritySchemes(payload)).toBe(false);
    expect(payload.result.tools[0].securitySchemes).toEqual([{ type: "noauth" }]);
  });

  it("rewrites JSON responses and leaves other responses untouched", async () => {
    const response = new Response(JSON.stringify({
      result: {
        tools: [{
          name: "health_check",
          _meta: { securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] }
        }]
      }
    }), { headers: { "content-type": "application/json" } });

    const rewritten = await withOpenAiToolDescriptors(response);
    await expect(rewritten.json()).resolves.toMatchObject({
      result: {
        tools: [{ securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] }]
      }
    });

    const text = new Response("ok", { headers: { "content-type": "text/plain" } });
    expect(await withOpenAiToolDescriptors(text)).toBe(text);
  });
});
