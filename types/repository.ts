export type RepositoryFile = {
  name: string;
  size: number | null;
}

export type RepositoryModel = {
  name: string;
  hasConfig: boolean;
  versions: { version: string, files: RepositoryFile[] }[];
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}
