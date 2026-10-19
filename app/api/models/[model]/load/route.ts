import fetchServer from "@/api/server";
import { enableOrTouchModel, errorResponse, isPollMode } from "@/api/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;

  if (isPollMode()) {
    try {
      const action = await enableOrTouchModel(model);
      return Response.json({ success: true, via: 'folder', action });
    } catch (error) {
      return errorResponse(error);
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch (err) {}

  try {
    const res = await fetchServer(`v2/repository/models/${model}/load`, {
      method: 'POST',
      ...(body && { body: JSON.stringify(body) }),
    });

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
