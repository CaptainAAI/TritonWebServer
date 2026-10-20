import fs from 'fs/promises';
import path from 'path';

// Host path of the directory Triton is started with (--model-repository).
// Triton must run in poll mode (or be reloaded) to pick up changes written here.
const repoPath = process.env.MODEL_REPOSITORY_PATH;

const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const VERSION_PATTERN = /^[0-9]+$/;

export class RepositoryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function getRepositoryPath() {
  if (!repoPath) {
    throw new RepositoryError('MODEL_REPOSITORY_PATH is not configured', 500);
  }
  return path.resolve(repoPath);
}

// Uploads are written here first, then renamed into the repository, so Triton's
// poller never sees a half-written file. Kept next to (not inside) the repository
// so it is on the same filesystem but not mistaken for a model.
export function getStagingPath() {
  return path.join(path.dirname(getRepositoryPath()), '.webui-uploads');
}

export function checkName(name: string, kind = 'model name') {
  if (!NAME_PATTERN.test(name) || name.length > 128) {
    throw new RepositoryError(`Invalid ${kind} "${name}": use letters, digits, "_", "-" and "."`);
  }
  return name;
}

export function checkVersion(version: string) {
  if (!VERSION_PATTERN.test(version)) {
    throw new RepositoryError(`Invalid version "${version}": must be a number`);
  }
  return version;
}

export function modelPath(model: string, ...rest: string[]) {
  return path.join(getRepositoryPath(), checkName(model), ...rest);
}

export async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// Triton rejects a config whose `name` differs from its directory, so catch it early.
export function checkConfig(model: string, config: string) {
  const match = config.match(/^\s*name\s*:\s*"([^"]*)"/m);
  if (match && match[1] !== model) {
    throw new RepositoryError(`Config name "${match[1]}" does not match model folder "${model}"`);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof RepositoryError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: String(error) }, { status: 500 });
}

// How Triton was started (--model-control-mode). In 'poll' mode Triton rejects load/unload
// API calls, so the web UI loads/unloads by moving model folders instead.
export function isPollMode() {
  return process.env.MODEL_CONTROL_MODE === 'poll' && !!repoPath;
}

// "Unloaded" models are parked here, next to the repository, so Triton stops seeing them.
export function getDisabledPath() {
  return process.env.MODEL_DISABLED_PATH || path.join(path.dirname(getRepositoryPath()), 'disabled_models');
}

export async function listDisabledModels() {
  try {
    const entries = await fs.readdir(getDisabledPath(), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

// Poll-mode unload: move <repo>/<model> to <disabled>/<model>; Triton unloads it on its next poll.
export async function disableModel(model: string) {
  const from = modelPath(model);
  const to = path.join(getDisabledPath(), checkName(model));
  if (!await exists(from)) {
    throw new RepositoryError(`Model folder "${model}" is not in the repository`, 404);
  }
  if (await exists(to)) {
    throw new RepositoryError(`"${model}" already exists in ${getDisabledPath()}`, 409);
  }
  await fs.mkdir(getDisabledPath(), { recursive: true });
  await fs.rename(from, to);
}

// Poll-mode load: move a disabled model back, or bump config.pbtxt's mtime so
// Triton sees a change and (re)loads it on its next poll.
export async function enableOrTouchModel(model: string): Promise<'enabled' | 'touched'> {
  const dir = modelPath(model);
  const disabled = path.join(getDisabledPath(), checkName(model));

  if (await exists(disabled)) {
    if (await exists(dir)) {
      throw new RepositoryError(`Cannot restore "${model}": a folder with that name is already in the repository`, 409);
    }
    await fs.rename(disabled, dir);
    return 'enabled';
  }

  if (!await exists(dir)) {
    throw new RepositoryError(`Model folder "${model}" not found`, 404);
  }
  const config = path.join(dir, 'config.pbtxt');
  const now = new Date();
  await fs.utimes(await exists(config) ? config : dir, now, now);
  return 'touched';
}

// Deleted folders are first moved here (next to the repository, so the move is one
// rename and Triton stops seeing the model at once), then removed.
function getTrashPath() {
  return path.join(path.dirname(getRepositoryPath()), '.webui-trash');
}

// Deletes a model folder or a version folder. Files that Triton's container created
// (as root, e.g. __pycache__ or an engine built with trtexec) may not be deletable by
// the web UI's user: the folder is then out of the repository already, and the error
// says how to remove the rest. Returns the folder that is left over, if any.
export async function deleteFolder(dir: string): Promise<string | null> {
  const trash = path.join(getTrashPath(), `${path.basename(dir)}-${Date.now()}`);
  await fs.mkdir(getTrashPath(), { recursive: true });
  try {
    await fs.rename(dir, trash);
  } catch (error: any) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      throw new RepositoryError(`No permission to delete ${dir} (owned by root). On the Jetson run: sudo rm -rf ${dir}`, 403);
    }
    throw error;
  }
  try {
    await fs.rm(trash, { recursive: true, force: true });
    return null;
  } catch (error: any) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM') return trash;
    throw error;
  }
}

// Folder of a model, in the repository or (when unloaded in poll mode) in disabled_models.
export async function findModelFolder(model: string) {
  const inRepo = modelPath(model);
  if (await exists(inRepo)) return inRepo;
  const disabled = path.join(getDisabledPath(), checkName(model));
  if (await exists(disabled)) return disabled;
  throw new RepositoryError(`Model folder "${model}" not found`, 404);
}
