// Keep in sync with ai-backend/config.py.
export const CURRENT_INDEX_FORMAT_VERSION = 3

export function isRepositoryIndexOutdated(indexFormatVersion: number | null | undefined): boolean {
  return (indexFormatVersion ?? 1) < CURRENT_INDEX_FORMAT_VERSION
}
