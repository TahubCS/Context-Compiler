export const CURRENT_INDEX_FORMAT_VERSION = 2

export function isRepositoryIndexOutdated(indexFormatVersion: number | null | undefined): boolean {
  return (indexFormatVersion ?? 1) < CURRENT_INDEX_FORMAT_VERSION
}
