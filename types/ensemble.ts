// Ensemble helpers shared by the browser and the API routes.

export type EnsembleStep = {
  model_name: string;
  model_version?: number | string;
  input_map?: Record<string, string>;
  output_map?: Record<string, string>;
}

export type Ensemble = {
  name: string;
  version: string;
  steps: EnsembleStep[];
}

export type Tensor = {
  name: string;
  data_type: string;
  dims: (number | string)[];
}

// Second output of an image ensemble: how the server letterboxed the image,
// needed to map boxes back to it.
export const LETTERBOX = 'LETTERBOX';

// The DALI model that turns encoded image bytes into the YOLO input.
export const PREPROCESS_MODEL = 'preprocess';

export type Letterbox = { scale: number, pad_x: number, pad_y: number, width: number, height: number };

// box = [x, y, width, height] in pixels of the original image.
export type Detection = { class_id: number, score: number, box: [number, number, number, number] };

export type DetectResult = {
  detections: Detection[];
  letterbox: Letterbox;
  output: { name: string, shape: number[] };
  infer_ms: number;
}

// Ensembles that stop working when `model` is unloaded: those that call it,
// then the ensembles that call those.
export function dependentsOf(model: string, ensembles: Ensemble[]) {
  const found = new Set<string>();
  const visit = (name: string) => {
    for (const ensemble of ensembles) {
      if (!found.has(ensemble.name) && ensemble.steps.some((step) => step.model_name === name)) {
        found.add(ensemble.name);
        visit(ensemble.name);
      }
    }
  };
  visit(model);
  found.delete(model);
  return [...found].sort();
}

// An ensemble that takes encoded image bytes and returns detections plus LETTERBOX:
// what TritonVision ConnectImage() and the Test tab expect.
export function isImageEnsemble(config: { platform?: string, input?: Tensor[], output?: Tensor[] }) {
  return config.platform === 'ensemble'
    && config.input?.length === 1 && config.input[0].data_type === 'TYPE_UINT8'
    && config.output?.length === 2 && config.output.some((tensor) => tensor.name === LETTERBOX);
}

export type ModelIO = { maxBatchSize: number, input: Tensor, output: Tensor };

// Reads max_batch_size and the first input/output of a config.pbtxt. Enough for the
// configs written in the Add model form; not a full pbtxt parser.
export function parseModelIO(pbtxt: string): ModelIO | null {
  const text = pbtxt.replace(/#.*$/gm, '');
  const tensor = (section: string): Tensor | null => {
    const block = text.match(new RegExp(`\\b${section}\\s*:?\\s*\\[\\s*\\{([^}]*)\\}`))?.[1];
    const name = block?.match(/name\s*:\s*"([^"]+)"/)?.[1];
    const dataType = block?.match(/data_type\s*:\s*(TYPE_\w+)/)?.[1];
    const dims = block?.match(/dims\s*:\s*\[([^\]]*)\]/)?.[1];
    if (!name || !dataType || !dims) return null;
    return { name, data_type: dataType, dims: dims.split(',').map((dim) => Number(dim.trim())) };
  };
  const input = tensor('input');
  const output = tensor('output');
  if (!input || !output) return null;
  return { maxBatchSize: Number(text.match(/max_batch_size\s*:\s*(\d+)/)?.[1] || 0), input, output };
}

// config.pbtxt of an ensemble (named "<model>_image" by default): the DALI preprocess model, then `model`.
// Returns an error instead when `model` does not take the 3x640x640 FP32 image preprocess makes.
export function imageEnsembleConfig(model: string, io: ModelIO, name = `${model}_image`): { name: string, config: string } | { error: string } {
  const inputDims = io.input.dims.map(Number);
  if (io.input.data_type !== 'TYPE_FP32' || inputDims.slice(-3).join() !== '3,640,640') {
    return {
      error: `${model} takes ${io.input.data_type.replace(/^TYPE_/, '')} [${inputDims.join(', ')}], `
        + `but ${PREPROCESS_MODEL} produces FP32 [3, 640, 640]`,
    };
  }

  // The ensemble has no batching, so the batch dim of 1 is written out in its shapes.
  const outputDims = io.maxBatchSize > 0 ? [1, ...io.output.dims] : io.output.dims;

  return {
    name,
    config: `# Encoded image in, detections out: ${PREPROCESS_MODEL} (DALI) -> ${model}.
# Used by TritonVision ConnectImage() / DetectImage().
name: "${name}"
platform: "ensemble"
max_batch_size: 0         # ${io.maxBatchSize > 0 ? 'no batching' : `${model} has no batching`}; the batch dim of 1 is explicit

input [
  {
    name: "IMAGE"
    data_type: TYPE_UINT8
    dims: [ 1, -1 ]       # bytes of a JPEG/PNG file
  }
]

output [
  {
    name: "${io.output.name}"
    data_type: ${io.output.data_type}
    dims: [ ${outputDims.join(', ')} ]
  },
  {
    name: "${LETTERBOX}"
    data_type: TYPE_FP32
    dims: [ 1, 5 ]        # scale, pad_x, pad_y, width, height
  }
]

ensemble_scheduling {
  step [
    {
      model_name: "${PREPROCESS_MODEL}"
      model_version: -1
      input_map { key: "ENCODED" value: "IMAGE" }
      output_map { key: "images" value: "preprocessed" }
      output_map { key: "${LETTERBOX}" value: "${LETTERBOX}" }
    },
    {
      model_name: "${model}"
      model_version: -1
      input_map { key: "${io.input.name}" value: "preprocessed" }
      output_map { key: "${io.output.name}" value: "${io.output.name}" }
    }
  ]
}
`,
  };
}
