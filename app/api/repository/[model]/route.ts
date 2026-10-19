import fs from 'fs/promises';
import path from 'path';
import { checkConfig, checkVersion, errorResponse, exists, modelPath, RepositoryError } from '@/api/repository';

// Creates a model folder. Body (all optional): { config: string, version: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;
  let body: { config?: string, version?: string } = {};
  try {
    body = await request.json();
  } catch (err) {}

  try {
    const dir = modelPath(model);
    if (await exists(dir)) {
      throw new RepositoryError(`Model folder "${model}" already exists`, 409);
    }

    if (body.config) {
      checkConfig(model, body.config);
    }

    await fs.mkdir(dir, { recursive: true });
    if (body.version) {
      await fs.mkdir(path.join(dir, checkVersion(body.version)), { recursive: true });
    }
    if (body.config) {
      await fs.writeFile(path.join(dir, 'config.pbtxt'), body.config);
    }

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
