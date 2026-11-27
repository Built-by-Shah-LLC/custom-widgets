import { dangerouslyDeleteByTag } from '@vercel/functions';
import { widgetCacheTag } from './cache-headers';
import { laggingCache, type LiveCacheResult } from './live-cache-warning';

type DeleteByTag = (
  tag: string | string[],
  options?: { revalidationDeadlineSeconds?: number }
) => Promise<unknown>;

export interface PublishWidgetCacheDeps {
  deleteByTag?: DeleteByTag;
}

async function deleteTags(tags: string[], deleteByTag: DeleteByTag): Promise<boolean> {
  const options = { revalidationDeadlineSeconds: 0 };
  try {
    await deleteByTag(tags, options);
    return true;
  } catch {
    try {
      await deleteByTag(tags, options);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Purge all requested widget variants in one call. Allowed clients refill on demand.
 */
export async function publishWidgetCache(
  widgetIds: string[],
  deps: PublishWidgetCacheDeps = {}
): Promise<LiveCacheResult> {
  const tags = [
    ...new Set(
      widgetIds
        .map((id) => widgetCacheTag(id))
        .filter((tag): tag is string => Boolean(tag))
    ),
  ];
  if (tags.length === 0) return { fresh: true };

  const deleteByTag =
    deps.deleteByTag ?? (process.env.VERCEL === '1' ? dangerouslyDeleteByTag : null);
  if (!deleteByTag) return { fresh: true };

  return (await deleteTags(tags, deleteByTag)) ? { fresh: true } : laggingCache();
}
