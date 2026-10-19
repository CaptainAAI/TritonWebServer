import fs from 'fs/promises';
import path from 'path';
import { errorResponse, getRepositoryPath } from '@/api/repository';

// Lists what is on disk in the model repository: folders, versions and files.
export async function GET() {
  try {
    const root = getRepositoryPath();
    const entries = await fs.readdir(root, { withFileTypes: true });

    const models = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const dir = path.join(root, entry.name);
        const children = await fs.readdir(dir, { withFileTypes: true });
        const versions = await Promise.all(children
          .filter((child) => child.isDirectory() && /^[0-9]+$/.test(child.name))
          .map(async (child) => {
            const versionDir = path.join(dir, child.name);
            const files = await fs.readdir(versionDir, { withFileTypes: true });
            return {
              version: child.name,
              files: await Promise.all(files.map(async (file) => ({
                name: file.name,
                size: file.isFile() ? (await fs.stat(path.join(versionDir, file.name))).size : null,
              }))),
            };
          }));

        return {
          name: entry.name,
          hasConfig: children.some((child) => child.name === 'config.pbtxt'),
          versions: versions.sort((a, b) => Number(a.version) - Number(b.version)),
        };
      }));

    return Response.json(models.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    return errorResponse(error);
  }
}
