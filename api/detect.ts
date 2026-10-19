import { Detection, Letterbox } from '@/types/ensemble';

// DALI cannot skip an image it fails to decode: one request that is not an image
// breaks the pre-processing model for every later request until it is reloaded.
export function isJpegOrPng(bytes: Uint8Array) {
  const starts = (magic: number[]) => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
  return starts([0xFF, 0xD8, 0xFF]) || starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
}

// Builds the body of a Triton HTTP infer request with one binary input and binary outputs.
// Returns the body and the length of its JSON header (Inference-Header-Content-Length).
export function binaryInferRequest(input: { name: string, shape: number[], datatype: string, data: Uint8Array }, outputs: string[]) {
  const header = new TextEncoder().encode(JSON.stringify({
    inputs: [{ name: input.name, shape: input.shape, datatype: input.datatype, parameters: { binary_data_size: input.data.length } }],
    outputs: outputs.map((name) => ({ name, parameters: { binary_data: true } })),
  }));
  const body = new Uint8Array(header.length + input.data.length);
  body.set(header);
  body.set(input.data, header.length);
  return { body, headerLength: header.length };
}

// Splits a Triton binary infer response into FP32 outputs. The binary data of the
// outputs follows the JSON header, in the order the header lists them.
export function readFloatOutputs(body: Uint8Array, headerLength: number) {
  const json = JSON.parse(new TextDecoder().decode(headerLength ? body.subarray(0, headerLength) : body));
  const outputs: Record<string, { shape: number[], data: Float32Array }> = {};
  let offset = headerLength;
  for (const output of json.outputs) {
    const size = output.parameters?.binary_data_size;
    // slice() copies, so the Float32Array starts on an aligned buffer.
    const data = size !== undefined
      ? new Float32Array(body.slice(offset, offset + size).buffer)
      : Float32Array.from(output.data);
    offset += size || 0;
    outputs[output.name] = { shape: output.shape.map(Number), data };
  }
  return outputs;
}

// Port of TritonVision Postprocess(): raw YOLO output (letterboxed model coordinates)
// to detections in the original image.
export function postprocess(d: Float32Array, shape: number[], lb: Letterbox, conf: number, iou: number): Detection[] {
  const { scale, pad_x: px, pad_y: py, width: cols, height: rows } = lb;
  const clamp = (v: number, max: number) => Math.trunc(Math.min(Math.max(v, 0), max - 1));
  const toFrame = (x1: number, y1: number, x2: number, y2: number): Detection['box'] => {
    const left = clamp((x1 - px) / scale, cols), top = clamp((y1 - py) / scale, rows);
    const right = clamp((x2 - px) / scale, cols), bottom = clamp((y2 - py) / scale, rows);
    return [left, top, right - left, bottom - top];
  };

  // Format A, end-to-end models: [1, N, 6] = x1, y1, x2, y2, score, class. NMS is already done.
  if (shape.length === 3 && shape[2] === 6) {
    const dets: Detection[] = [];
    for (let i = 0; i < shape[1]; i++) {
      const r = d.subarray(i * 6, i * 6 + 6);
      if (r[4] >= conf) dets.push({ class_id: r[5], score: r[4], box: toFrame(r[0], r[1], r[2], r[3]) });
    }
    return dets;
  }

  // Format B, one-to-many models: [1, 4 + nc, N] = cx, cy, w, h, then one score per
  // class, stored column-wise (value k of candidate i is d[k * n + i]).
  const nc = shape[1] - 4, n = shape[2];
  const candidates: Detection[] = [];
  for (let i = 0; i < n; i++) {
    let best = 0, s = 0;
    for (let c = 0; c < nc; c++) {
      if (d[(4 + c) * n + i] > s) { s = d[(4 + c) * n + i]; best = c; }
    }
    if (s < conf) continue;
    const cx = d[i], cy = d[n + i], w = d[2 * n + i], h = d[3 * n + i];
    candidates.push({ class_id: best, score: s, box: toFrame(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2) });
  }

  // Greedy NMS within each class.
  candidates.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const c of candidates) {
    if (!kept.some((k) => k.class_id === c.class_id && overlap(k.box, c.box) > iou)) kept.push(c);
  }
  return kept;
}

function overlap(a: Detection['box'], b: Detection['box']) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}
