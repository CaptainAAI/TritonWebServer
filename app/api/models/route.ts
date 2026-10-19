import fetchServer from "@/api/server";
import { isPollMode, listDisabledModels } from "@/api/repository";

export async function POST() {
  try {
    const res = await fetchServer(`v2/repository/index`, { method: 'POST' });

    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error }, { status: res.status });
    }

    const models: { name: string, version?: string, state?: string, reason?: string }[] = await res.json();

    // In poll mode, "unloaded" models live outside the repository; list them so they can be loaded again.
    if (isPollMode()) {
      const disabled = await listDisabledModels();
      return Response.json([
        ...models.filter((model) => !disabled.includes(model.name)),
        ...disabled.map((name) => ({ name, version: '', state: 'DISABLED', reason: 'Unloaded: folder moved out of the repository' })),
      ]);
    }

    return Response.json(models);
  } catch (error) {
    console.error(error);
    return Response.json({ error }, { status: 500 });
  }
}
  