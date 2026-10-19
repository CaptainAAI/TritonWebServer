import fetchServer from "@/api/server";
import { errorResponse } from "@/api/repository";
import { Ensemble } from "@/types/ensemble";

// Loaded ensembles and the models each one calls, from Triton's model configs.
export async function GET() {
  try {
    const res = await fetchServer('v2/repository/index', { method: 'POST' });
    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error }, { status: res.status });
    }

    const models: { name: string, version?: string, state?: string }[] = await res.json();
    const configs = await Promise.all(models
      .filter((model) => model.state === 'READY')
      .map(async (model) => {
        const configRes = await fetchServer(`v2/models/${model.name}/versions/${model.version}/config`, { cache: 'no-store' });
        return configRes.ok ? { version: model.version || '', config: await configRes.json() } : null;
      }));

    const ensembles: Ensemble[] = configs
      .filter((item) => item?.config.platform === 'ensemble')
      .map((item) => ({
        name: item!.config.name,
        version: item!.version,
        steps: item!.config.ensemble_scheduling?.step || [],
      }));

    return Response.json(ensembles);
  } catch (error) {
    return errorResponse(error);
  }
}
