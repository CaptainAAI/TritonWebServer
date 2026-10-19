import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { checkName, checkVersion, errorResponse, exists, getStagingPath, modelPath, RepositoryError } from '@/api/repository';

// Uploads a file into <model>/<version>/<file>. Body: the raw file bytes.
// Streamed to disk so large model files are not held in memory.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ model: string, version: string, file: string }> }
) {
  const { model, version, file } = await params;
  let tmpFile: string | undefined;

  try {
    checkVersion(version);
    checkName(file, 'file name');
    if (!await exists(modelPath(model))) {
      throw new RepositoryError(`Model folder "${model}" does not exist`, 404);
    }
    if (!request.body) {
      throw new RepositoryError('Request body is empty');
    }

    const stagingDir = getStagingPath();
    await fs.promises.mkdir(stagingDir, { recursive: true });
    tmpFile = path.join(stagingDir, `${crypto.randomUUID()}-${file}`);
    await pipeline(Readable.fromWeb(request.body as any), fs.createWriteStream(tmpFile));

    const versionDir = modelPath(model, version);
    await fs.promises.mkdir(versionDir, { recursive: true });
    await fs.promises.rename(tmpFile, path.join(versionDir, file));
    tmpFile = undefined;

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (tmpFile) {
      await fs.promises.rm(tmpFile, { force: true });
    }
  }
}
