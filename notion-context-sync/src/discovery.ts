import type { NotionClient } from "./notionClient.js";
import { AppError, type PageConfig } from "./types.js";

const DEFAULT_MAX_DISCOVERED_PAGES = 200;

export interface DiscoveryResult {
  pages: PageConfig[];
  discoveredCount: number;
}

export async function discoverPages(
  seedPages: PageConfig[],
  notionClient: Pick<NotionClient, "listPageReferences">,
  maxPages = DEFAULT_MAX_DISCOVERED_PAGES
): Promise<DiscoveryResult> {
  const pagesById = new Map<string, PageConfig>();
  const queue: PageConfig[] = [];
  const scanned = new Set<string>();

  for (const page of seedPages) {
    pagesById.set(page.pageId, page);
    queue.push(page);
  }

  let discoveredCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || scanned.has(current.pageId)) {
      continue;
    }
    scanned.add(current.pageId);

    const references = await notionClient.listPageReferences(current.pageId);
    for (const reference of references) {
      if (pagesById.has(reference.pageId)) {
        continue;
      }
      if (pagesById.size >= maxPages) {
        throw new AppError("discovery_limit_exceeded", `discovered page limit exceeded: ${maxPages}`, 3);
      }
      const page = {
        pageId: reference.pageId,
        title: reference.title
      };
      pagesById.set(page.pageId, page);
      queue.push(page);
      discoveredCount += 1;
    }
  }

  return {
    pages: Array.from(pagesById.values()),
    discoveredCount
  };
}
