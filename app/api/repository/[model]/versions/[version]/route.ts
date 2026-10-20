import fs from 'fs/promises';
import path from 'path';
import { checkVersion, deleteFolder, errorResponse, exists, modelPath, RepositoryError } from '@/api/repository';

// Deletes one version folder (<model>/<version>/). The last version cannot be deleted:
// delete the model instead.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ model: string, version: string }> }
) {
  const { model, version } = await params;
  try {
    const dir = modelPath(model, checkVersion(version));
    if (!await exists(dir)) {
      throw new RepositoryError(`Version ${version} of "${model}" not found`, 404);
    }

    const versions = (await fs.readdir(modelPath(model), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[0-9]+$/.test(entry.name));
    if (versions.length < 2) {
      throw new RepositoryError(`Version ${version} is the only version of "${model}": delete the model instead`);
    }

    const leftover = await deleteFolder(dir);
    return Response.json({ success: true, leftover });
  } catch (error) {
    return errorResponse(error);
  }
}
