import fetchServer from "@/api/server";
import { exists, isPollMode, listDisabledModels, modelPath } from "@/api/repository";

export async function POST() {
  try {
    const res = await fetchServer(`v2/repository/index`, { method: 'POST' });

    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error }, { status: res.status });
    }

    const models: { name: string, version?: string, state?: string, reason?: string }[] = await res.json();

    if (isPollMode()) {
      // Triton keeps listing a model or version (as UNAVAILABLE) after its folder is
      // deleted; show only what is still on disk.
      const onDisk = await Promise.all(models.map((model) =>
        exists(model.version ? modelPath(model.name, model.version) : modelPath(model.name)).catch(() => true)));

      // "Unloaded" models live outside the repository; list them so they can be loaded again.
      const disabled = await listDisabledModels();
      return Response.json([
        ...models.filter((model, i) => onDisk[i] && !disabled.includes(model.name)),
        ...disabled.map((name) => ({ name, version: '', state: 'DISABLED', reason: 'Unloaded: folder moved out of the repository' })),
      ]);
    }

    return Response.json(models);
  } catch (error) {
    console.error(error);
    return Response.json({ error }, { status: 500 });
  }
}
