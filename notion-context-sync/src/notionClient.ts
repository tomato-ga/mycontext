import { optionalEnv, requireEnv } from "./config.js";
import { retryAfterToMs, sleep } from "./sleep.js";
import { AppError, errorMessage, type NotionMarkdownResponse, type NotionPageReference } from "./types.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 4;

export function isRetryableNotionStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export class NotionClient {
  private readonly apiKey: string;
  private readonly version: string;

  constructor(apiKey: string, version: string) {
    this.apiKey = apiKey;
    this.version = version;
  }

  async fetchNotionMarkdown(pageId: string): Promise<NotionMarkdownResponse> {
    const url = `https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}/markdown`;
    return parseNotionMarkdownResponse(await this.requestJson(url));
  }

  async listPageReferences(pageId: string): Promise<NotionPageReference[]> {
    const references: NotionPageReference[] = [];
    let nextCursor: string | null = null;

    do {
      const url = new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children`);
      url.searchParams.set("page_size", "100");
      if (nextCursor !== null) {
        url.searchParams.set("start_cursor", nextCursor);
      }

      const response = parseBlockChildrenResponse(await this.requestJson(url.toString()));
      for (const block of response.results) {
        const reference = await this.parsePageReference(pageId, block);
        if (reference !== null) {
          references.push(reference);
        }
      }
      nextCursor = response.next_cursor;
    } while (nextCursor !== null);

    return references;
  }

  async fetchPageTitle(pageId: string): Promise<string> {
    const url = `https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`;
    return parsePageTitleResponse(await this.requestJson(url));
  }

  private async parsePageReference(parentPageId: string, block: NotionBlock): Promise<NotionPageReference | null> {
    if (block.type === "child_page") {
      const childPage = block as Extract<NotionBlock, { type: "child_page" }>;
      return {
        pageId: childPage.id,
        title: childPage.child_page.title,
        parentPageId,
        kind: "child_page"
      };
    }

    if (block.type === "link_to_page") {
      const pageLink = block as Extract<NotionBlock, { type: "link_to_page" }>;
      if (pageLink.link_to_page.type !== "page_id") {
        return null;
      }
      return {
        pageId: pageLink.link_to_page.page_id,
        title: await this.fetchPageTitle(pageLink.link_to_page.page_id),
        parentPageId,
        kind: "link_to_page"
      };
    }

    return null;
  }

  private async requestJson(url: string): Promise<unknown> {
    let lastMessage = "Notion API request failed";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Notion-Version": this.version
          }
        });
      } catch (error) {
        lastMessage = `Notion request failed: ${errorMessage(error)}`;
        if (attempt === MAX_ATTEMPTS - 1) {
          throw new AppError("notion_request_failed", redact(lastMessage, this.apiKey), 1, error);
        }
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (response.ok) {
        return response.json();
      }

      const safeBody = await readSafeErrorBody(response, this.apiKey);
      lastMessage = `Notion API ${response.status}: ${safeBody}`;
      if (response.status === 403 || response.status === 404 || response.status === 401) {
        throw new AppError("notion_auth_or_access", lastMessage, 3);
      }

      if (!isRetryableNotionStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
        throw new AppError("notion_api_failed", lastMessage, 1);
      }

      const retryAfterMs = retryAfterToMs(response.headers.get("Retry-After"));
      await sleep(retryAfterMs ?? 500 * 2 ** attempt);
    }

    throw new AppError("notion_api_failed", lastMessage, 1);
  }
}

export function createNotionClientFromEnv(): NotionClient {
  return new NotionClient(requireEnv("NOTION_API_KEY"), optionalEnv("NOTION_VERSION") ?? "2026-03-11");
}

function parseNotionMarkdownResponse(value: unknown): NotionMarkdownResponse {
  if (!value || typeof value !== "object") {
    throw new AppError("invalid_notion_response", "Notion response was not an object", 1);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.object !== "string" ||
    typeof record.id !== "string" ||
    typeof record.markdown !== "string" ||
    typeof record.truncated !== "boolean" ||
    !Array.isArray(record.unknown_block_ids) ||
    !record.unknown_block_ids.every((id) => typeof id === "string")
  ) {
    throw new AppError("invalid_notion_response", "Notion markdown response shape was invalid", 1);
  }
  return {
    object: record.object,
    id: record.id,
    markdown: record.markdown,
    truncated: record.truncated,
    unknown_block_ids: record.unknown_block_ids
  };
}

interface NotionBlockList {
  results: NotionBlock[];
  next_cursor: string | null;
}

type NotionBlock =
  | {
      id: string;
      type: "child_page";
      child_page: {
        title: string;
      };
    }
  | {
      id: string;
      type: "link_to_page";
      link_to_page:
        | {
            type: "page_id";
            page_id: string;
          }
        | {
            type: "database_id";
            database_id: string;
          };
    }
  | {
      id: string;
      type: string;
      [key: string]: unknown;
    };

export function parseBlockChildrenResponse(value: unknown): NotionBlockList {
  if (!value || typeof value !== "object") {
    throw new AppError("invalid_notion_response", "Notion block children response was not an object", 1);
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.results)) {
    throw new AppError("invalid_notion_response", "Notion block children response results were invalid", 1);
  }
  const results: NotionBlock[] = [];
  for (const item of record.results) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const block = item as Record<string, unknown>;
    if (typeof block.id !== "string" || typeof block.type !== "string") {
      continue;
    }
    if (block.type === "child_page") {
      const childPage = block.child_page;
      if (!childPage || typeof childPage !== "object" || typeof (childPage as Record<string, unknown>).title !== "string") {
        continue;
      }
      results.push({
        id: block.id,
        type: "child_page",
        child_page: {
          title: (childPage as Record<string, string>).title
        }
      });
      continue;
    }
    if (block.type === "link_to_page") {
      const linkToPage = block.link_to_page;
      if (!linkToPage || typeof linkToPage !== "object") {
        continue;
      }
      const link = linkToPage as Record<string, unknown>;
      if (link.type === "page_id" && typeof link.page_id === "string") {
        results.push({
          id: block.id,
          type: "link_to_page",
          link_to_page: {
            type: "page_id",
            page_id: link.page_id
          }
        });
        continue;
      }
      if (link.type === "database_id" && typeof link.database_id === "string") {
        results.push({
          id: block.id,
          type: "link_to_page",
          link_to_page: {
            type: "database_id",
            database_id: link.database_id
          }
        });
      }
    }
  }

  return {
    results,
    next_cursor: typeof record.next_cursor === "string" ? record.next_cursor : null
  };
}

export function parsePageTitleResponse(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new AppError("invalid_notion_response", "Notion page response was not an object", 1);
  }
  const properties = (value as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object") {
    return "Untitled";
  }

  for (const property of Object.values(properties as Record<string, unknown>)) {
    if (!property || typeof property !== "object") {
      continue;
    }
    const record = property as Record<string, unknown>;
    if (record.type !== "title" || !Array.isArray(record.title)) {
      continue;
    }
    const text = richTextPlainText(record.title);
    return text.length > 0 ? text : "Untitled";
  }

  return "Untitled";
}

function richTextPlainText(value: unknown[]): string {
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const plainText = (item as Record<string, unknown>).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("");
}

async function readSafeErrorBody(response: Response, apiKey: string): Promise<string> {
  const text = await response.text();
  const message = text.length === 0 ? response.statusText : text.slice(0, 500);
  return redact(message, apiKey);
}

function redact(value: string, secret: string): string {
  if (secret.length === 0) {
    return value;
  }
  return value.split(secret).join("[redacted]");
}
