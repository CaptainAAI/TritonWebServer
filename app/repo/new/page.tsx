'use client'

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Breadcrumbs, Button, Checkbox, FormControlLabel, LinearProgress, MenuItem, Paper, Stack, TextField, Typography, Container } from '@mui/material';
import { useRouter } from 'next/navigation';
import SaveIcon from '@mui/icons-material/Save';
import { useNotify } from '@/components/Notify';
import FileDrop from '@/components/FileDrop';
import { apiFetch, errorMessage, uploadModelFile } from '@/api/client';
import { Model } from '@/types/model';
import { Ensemble, imageEnsembleConfig, ModelIO, parseModelIO, PREPROCESS_MODEL } from '@/types/ensemble';

const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

// YOLO exported with a fixed batch of 1: no batching, the batch dim is part of the shapes.
const tensors = `input [
  {
    name: "images"
    data_type: TYPE_FP32
    dims: [ 1, 3, 640, 640 ]
  }
]

output [
  {
    name: "output0"
    data_type: TYPE_FP32
    dims: [ 1, 6, 8400 ]   # 1, 4 + num_classes, 8400
  }
]`;

// The DALI model from model_repository/preprocess: encoded image in, YOLO input + LETTERBOX out.
const daliTensors = `input [
  {
    name: "ENCODED"
    data_type: TYPE_UINT8
    dims: [-1]
  }
]
# Same order as the values the pipeline in dali.py returns.
output [
  {
    name: "images"
    data_type: TYPE_FP32
    dims: [3, 640, 640]
  },
  {
    name: "LETTERBOX"
    data_type: TYPE_FP32
    dims: [5]
  }
]`;

const platforms: Record<string, { label: string, fileName: string, header: string, body: string }> = {
  onnx: {
    label: 'ONNX Runtime',
    fileName: 'model.onnx',
    header: 'platform: "onnxruntime_onnx"',
    body: `max_batch_size: 0\n\n${tensors}\n\ninstance_group [{ kind: KIND_GPU }]`,
  },
  tensorrt: {
    label: 'TensorRT',
    fileName: 'model.plan',
    header: 'platform: "tensorrt_plan"',
    body: `max_batch_size: 0\n\n${tensors}\n\ninstance_group [{ kind: KIND_GPU }]`,
  },
  pytorch: {
    label: 'PyTorch (TorchScript)',
    fileName: 'model.pt',
    header: 'backend: "pytorch"',
    body: `max_batch_size: 0\n\n${tensors.replace('"images"', '"INPUT__0"').replace('"output0"', '"OUTPUT__0"')}\n\ninstance_group [{ kind: KIND_GPU }]`,
  },
  python: {
    label: 'Python',
    fileName: 'model.py',
    header: 'backend: "python"',
    body: `max_batch_size: 0\n${tensors}\ninstance_group [{ kind: KIND_CPU }]`,
  },
  dali: {
    label: 'DALI (pre-processing)',
    fileName: 'dali.py',
    header: 'backend: "dali"',
    body: `max_batch_size: 8\n${daliTensors}\ninstance_group [{ kind: KIND_GPU }]`,
  },
  ensemble: {
    label: 'Ensemble',
    fileName: '',
    header: 'platform: "ensemble"',
    body: 'max_batch_size: 0\n# Pick a YOLO model above to fill in the inputs, outputs and steps.',
  },
};

// Platforms of models that can get a "<name>_image" ensemble (DALI pre-processing in front).
const IMAGE_PLATFORMS = ['onnx', 'tensorrt', 'pytorch'];

type Base = { model: string, io: ModelIO };

function configTemplate(name: string, platform: string, base?: Base | null) {
  if (platform === 'ensemble' && base) {
    const generated = imageEnsembleConfig(base.model, base.io, name);
    if ('config' in generated) return generated.config;
  }
  const { header, body } = platforms[platform];
  return `name: "${name}"\n${header}\n${body}\n`;
}

function Section({ step, title, children }: { step: number, title: string, children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2.5 }}>
        <Box sx={{
          width: 28, height: 28, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText',
          display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600,
        }}>
          {step}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
      </Stack>
      {children}
    </Paper>
  );
}

function NewModel() {
  const router = useRouter();
  const notify = useNotify();
  const [name, setName] = useState<string>('');
  const [version, setVersion] = useState<string>('1');
  const [platform, setPlatform] = useState<string>('onnx');
  const [config, setConfig] = useState<string>(configTemplate('', 'onnx'));
  const [configEdited, setConfigEdited] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>(platforms.onnx.fileName);
  const [saving, setSaving] = useState<boolean>(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [withImage, setWithImage] = useState<boolean>(true);
  const [models, setModels] = useState<Model[]>([]);
  const [ensembleNames, setEnsembleNames] = useState<string[]>([]);
  const [base, setBase] = useState<Base | null>(null);
  const [baseModel, setBaseModel] = useState<string>('');
  const [baseError, setBaseError] = useState<string>('');

  useEffect(() => {
    apiFetch('/api/models', { method: 'POST' }).then((res) => res.json()).then(setModels).catch(() => {});
    apiFetch('/api/ensembles').then((res) => res.json())
      .then((ensembles: Ensemble[]) => setEnsembleNames(ensembles.map((e) => e.name))).catch(() => {});
  }, []);

  const nameError = name && !NAME_PATTERN.test(name) ? 'Use letters, digits, "_", "-" and "." only' : '';
  const versionError = version && !/^[0-9]+$/.test(version) ? 'Must be a number' : '';
  const fileNameError = fileName && !NAME_PATTERN.test(fileName) ? 'Invalid file name' : '';
  const isEnsemble = platform === 'ensemble';
  const canSave = name && version && (fileName || isEnsemble) && !nameError && !versionError && !fileNameError && !saving;

  // Models the ensemble template can put after preprocess: loaded, and not ensembles or preprocess itself.
  const baseCandidates = models.filter((m) => m.state === 'READY' && m.name !== PREPROCESS_MODEL && !ensembleNames.includes(m.name));
  const missingPreprocess = models.length > 0 && !models.some((m) => m.name === PREPROCESS_MODEL);

  // The "<name>_image" ensemble offered for a new YOLO model, generated from the config being edited.
  const io = IMAGE_PLATFORMS.includes(platform) && name && !nameError ? parseModelIO(config) : null;
  const imageEnsemble = !IMAGE_PLATFORMS.includes(platform) || !name || nameError ? null
    : io ? imageEnsembleConfig(name, io) : { error: 'Could not read the first input and output in config.pbtxt' };
  const createImage = withImage && !!imageEnsemble && 'config' in imageEnsemble;

  // Keep the template in sync with name/platform until the user edits the config by hand.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!configEdited) setConfig(configTemplate(value, platform, base));
  };

  const handlePlatformChange = (value: string) => {
    setPlatform(value);
    setFileName(platforms[value].fileName);
    if (!configEdited) setConfig(configTemplate(name, value, base));
  };

  // Ensemble template: read the chosen model's config from Triton and generate the steps.
  const pickBase = async (model: string) => {
    setBaseModel(model);
    setBaseError('');
    try {
      const version = models.find((m) => m.name === model)?.version || '1';
      const { config: c } = await (await apiFetch(`/api/models/${model}/versions/${version}`)).json();
      const picked = { model, io: { maxBatchSize: c.max_batch_size || 0, input: c.input[0], output: c.output[0] } };
      const generated = imageEnsembleConfig(picked.model, picked.io);
      if ('error' in generated) {
        setBase(null);
        setBaseError(generated.error);
        return;
      }
      // Suggest "<model>_image" unless the user typed a name of their own.
      const newName = !name || name === (base && `${base.model}_image`) ? generated.name : name;
      setBase(picked);
      setName(newName);
      setConfig(configTemplate(newName, 'ensemble', picked));
      setConfigEdited(false);
    } catch (err) {
      setBase(null);
      setBaseError(errorMessage(err));
    }
  };

  const pickFile = (picked: File | null) => {
    if (!picked) return setFile(null);
    setFile(picked);
    if (platform === 'dali' && /\.(py|dali)$/.test(picked.name)) {
      // dali.py is serialized by Triton on load (@autoserialize); model.dali was serialized beforehand.
      setFileName(picked.name.endsWith('.dali') ? 'model.dali' : 'dali.py');
      return;
    }
    const match = Object.entries(platforms).find(([, p]) => picked.name.endsWith(p.fileName.slice(p.fileName.lastIndexOf('.'))));
    if (match && match[0] !== platform) handlePlatformChange(match[0]);
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/api/repository/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify({ config, version }),
      });

      if (file && !isEnsemble) {
        setProgress(0);
        await uploadModelFile(name, version, fileName, file, setProgress);
      }

      // Created last, so Triton sees the model it calls complete.
      if (createImage && imageEnsemble && 'config' in imageEnsemble) {
        try {
          await apiFetch(`/api/repository/${encodeURIComponent(imageEnsemble.name)}`, {
            method: 'POST',
            body: JSON.stringify({ config: imageEnsemble.config, version: '1' }),
          });
        } catch (err) {
          notify(`Added ${name}, but not ${imageEnsemble.name}: ${errorMessage(err)}`, 'warning');
          router.push('/repo');
          return;
        }
        notify(`Added ${name} and ${imageEnsemble.name}. Triton will load them on its next repository poll.`);
      } else {
        notify(`Added ${name}. Triton will load it on its next repository poll.`);
      }
      router.push('/repo');
    } catch (err) {
      setError(errorMessage(err));
    }
    setProgress(null);
    setSaving(false);
  };

  return (
    <Container maxWidth="md" sx={{ mt: 3, mb: 6 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link href="/repo"><Typography color="text.secondary" sx={{ '&:hover': { textDecoration: 'underline' } }}>Models</Typography></Link>
        <Typography color="text.primary">Add model</Typography>
      </Breadcrumbs>

      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>Add model</Typography>
          <Typography variant="body2" color="text.secondary">
            Creates a folder in the model repository with a config and model file.
          </Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Section step={1} title="Model">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Model name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              error={!!nameError}
              helperText={nameError || 'Folder name, and the name clients use to call the model'}
              autoFocus
              sx={{ flex: 2 }}
            />
            <TextField
              select
              label="Platform"
              value={platform}
              onChange={(e) => handlePlatformChange(e.target.value)}
              sx={{ flex: 1.2 }}
            >
              {Object.entries(platforms).map(([key, p]) => (
                <MenuItem key={key} value={key}>{p.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              error={!!versionError}
              helperText={versionError || ' '}
              sx={{ flex: 0.6 }}
            />
          </Stack>
        </Section>

        {isEnsemble ? (
          <Section step={2} title="Pipeline">
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                An ensemble has no model file, only an empty version folder. Pick the YOLO model to run after
                the DALI <code>{PREPROCESS_MODEL}</code> model, or write the steps in config.pbtxt yourself.
              </Typography>
              <TextField
                select
                label="YOLO model"
                value={baseModel}
                onChange={(e) => pickBase(e.target.value)}
                helperText={baseCandidates.length ? ' ' : 'No loaded models to choose from'}
              >
                {baseCandidates.map((m) => <MenuItem key={m.name} value={m.name}>{m.name}</MenuItem>)}
              </TextField>
              {baseError && <Alert severity="warning">{baseError}</Alert>}
              {missingPreprocess && (
                <Alert severity="warning">
                  There is no <code>{PREPROCESS_MODEL}</code> model in the repository. The ensemble cannot load without it.
                </Alert>
              )}
            </Stack>
          </Section>
        ) : (
          <Section step={2} title="Model file">
            <Stack spacing={2}>
              <FileDrop
                file={file}
                onChange={pickFile}
                disabled={saving}
                hint=".onnx, .plan, .pt, .py, dali.py… Optional: you can create the folder with just a config."
              />
              {platform === 'dali' && (
                <Alert severity="info">
                  <code>dali.py</code> must decorate its pipeline with <code>@autoserialize</code>; Triton serializes it on load
                  (see <code>{PREPROCESS_MODEL}/1/dali.py</code>). On Jetson, <code>fn.decoders.image</code> needs <code>affine=False</code>.
                </Alert>
              )}
              {file && (
                <TextField
                  label="Save as"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  error={!!fileNameError}
                  helperText={fileNameError || `Stored as ${name || '<model>'}/${version || '<version>'}/${fileName}`}
                />
              )}
            </Stack>
          </Section>
        )}

        <Section step={3} title="config.pbtxt">
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Adjust the input and output names and shapes to match your model.
            </Typography>
            {configEdited && (
              <Button size="small" onClick={() => { setConfig(configTemplate(name, platform, base)); setConfigEdited(false); }}>
                Reset to template
              </Button>
            )}
          </Stack>
          <TextField
            fullWidth
            multiline
            minRows={18}
            value={config}
            onChange={(e) => {
              setConfig(e.target.value);
              setConfigEdited(true);
            }}
            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 } } }}
          />
        </Section>

        {IMAGE_PLATFORMS.includes(platform) && (
          <Section step={4} title="Image ensemble">
            <Stack spacing={1.5}>
              <FormControlLabel
                control={<Checkbox checked={withImage} onChange={(e) => setWithImage(e.target.checked)} disabled={saving} />}
                label={<>Also create <b>{name || '<model>'}_image</b>: DALI pre-processing → {name || '<model>'}</>}
              />
              <Typography variant="body2" color="text.secondary">
                Clients then send JPEG/PNG bytes instead of a pre-processed tensor, e.g. with TritonVision{' '}
                <code>ConnectImage(&quot;…&quot;, &quot;{name || '<model>'}_image&quot;)</code>.
              </Typography>
              {withImage && imageEnsemble && 'error' in imageEnsemble && (
                <Alert severity="warning">Not created: {imageEnsemble.error}</Alert>
              )}
              {withImage && missingPreprocess && (
                <Alert severity="warning">
                  There is no <code>{PREPROCESS_MODEL}</code> model in the repository. The ensemble cannot load without it.
                </Alert>
              )}
            </Stack>
          </Section>
        )}

        {progress !== null && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Uploading… {progress}%</Typography>
            <LinearProgress variant="determinate" value={progress} />
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => router.push('/repo')} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            loading={saving}
            disabled={!canSave}
            onClick={save}
          >
            Create model
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}

export default NewModel;
