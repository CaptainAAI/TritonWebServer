import fs from 'fs/promises';
import { checkConfig, errorResponse, exists, modelPath, RepositoryError } from '@/api/repository';

// Returns the raw config.pbtxt from disk.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;

  try {
    const file = modelPath(model, 'config.pbtxt');
    if (!await exists(file)) {
      throw new RepositoryError(`Model "${model}" has no config.pbtxt`, 404);
    }
    return new Response(await fs.readFile(file, 'utf8'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Creates or replaces config.pbtxt. Body: the pbtxt text.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;

  try {
    const dir = modelPath(model);
    if (!await exists(dir)) {
      throw new RepositoryError(`Model folder "${model}" does not exist`, 404);
    }

    const config = await request.text();
    checkConfig(model, config);
    await fs.writeFile(modelPath(model, 'config.pbtxt'), config);

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
