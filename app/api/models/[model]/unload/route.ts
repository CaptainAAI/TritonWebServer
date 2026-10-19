import fetchServer from "@/api/server";
import { disableModel, errorResponse, isPollMode } from "@/api/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;

  if (isPollMode()) {
    try {
      await disableModel(model);
      return Response.json({ success: true, via: 'folder' });
    } catch (error) {
      return errorResponse(error);
    }
  }

  try {
    const res = await fetchServer(`v2/repository/models/${model}/unload`, { method: 'POST' });

    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error }, { status: res.status });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error }, { status: 500 });
  }
}
