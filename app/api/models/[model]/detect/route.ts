import fetchServer from "@/api/server";
import { errorResponse, RepositoryError } from "@/api/repository";
import { binaryInferRequest, isJpegOrPng, postprocess, readFloatOutputs } from "@/api/detect";
import { DetectResult, LETTERBOX } from "@/types/ensemble";

// Runs one image through an image ensemble: the encoded bytes go to Triton as is,
// pre-processing runs there (DALI), post-processing (confidence filter, NMS) here.
// Body: a JPEG or PNG file. Query: conf, iou.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;
  const query = new URL(request.url).searchParams;
  const threshold = (key: string, fallback: number) => Math.min(Math.max(Number(query.get(key) ?? fallback) || fallback, 0.01), 1);
  const conf = threshold('conf', 0.25);
  const iou = threshold('iou', 0.45);

  try {
    const image = new Uint8Array(await request.arrayBuffer());
    if (!isJpegOrPng(image)) {
      throw new RepositoryError('Only JPEG and PNG images can be sent: anything else breaks the DALI pre-processing model until it is reloaded');
    }

    const metaRes = await fetchServer(`v2/models/${encodeURIComponent(model)}`, { cache: 'no-store' });
    if (!metaRes.ok) {
      const error = await metaRes.text();
      return Response.json({ error }, { status: metaRes.status });
    }
    const meta: {
      platform: string,
      inputs: { name: string, datatype: string, shape: number[] }[],
      outputs: { name: string }[],
    } = await metaRes.json();
    const outputName = meta.outputs.find((output) => output.name !== LETTERBOX)?.name;
    // The DALI model alone has the same inputs and outputs, but returns pixels, not detections.
    if (meta.platform !== 'ensemble' || meta.inputs.length !== 1 || meta.inputs[0].datatype !== 'UINT8'
      || meta.outputs.length !== 2 || !outputName) {
      throw new RepositoryError(`${model} is not an image ensemble (needs 1 UINT8 input and outputs <detections> + ${LETTERBOX})`);
    }

    // Input shape [1, -1] when the ensemble declares the batch dim, [-1] otherwise.
    const input = meta.inputs[0];
    const shape = input.shape.length === 2 ? [1, image.length] : [image.length];
    const { body, headerLength } = binaryInferRequest({ name: input.name, shape, datatype: 'UINT8', data: image }, [outputName, LETTERBOX]);

    const t0 = performance.now();
    const res = await fetchServer(`v2/models/${encodeURIComponent(model)}/infer`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/octet-stream', 'Inference-Header-Content-Length': String(headerLength) },
      cache: 'no-store',
    });
    const inferMs = performance.now() - t0;
    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error }, { status: res.status });
    }

    const outputs = readFloatOutputs(new Uint8Array(await res.arrayBuffer()), Number(res.headers.get('Inference-Header-Content-Length') || 0));
    const det = outputs[outputName], lb = outputs[LETTERBOX]?.data;
    if (!det || !lb || lb.length < 5) {
      throw new RepositoryError(`${model} returned no ${outputName} or an invalid ${LETTERBOX}`, 502);
    }

    const letterbox = { scale: lb[0], pad_x: Math.trunc(lb[1]), pad_y: Math.trunc(lb[2]), width: Math.trunc(lb[3]), height: Math.trunc(lb[4]) };
    const result: DetectResult = {
      detections: postprocess(det.data, det.shape, letterbox, conf, iou),
      letterbox,
      output: { name: outputName, shape: det.shape },
      infer_ms: inferMs,
    };
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
