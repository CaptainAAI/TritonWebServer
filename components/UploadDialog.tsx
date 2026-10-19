'use client'

import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import FileDrop from '@/components/FileDrop';
import { useNotify } from '@/components/Notify';
import { apiFetch, errorMessage, uploadModelFile } from '@/api/client';
import { RepositoryModel } from '@/types/repository';

const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

type Mode = 'new' | 'replace';

// Uploads a model file for an existing model: either as a new version folder
// (old version stays on disk for rollback) or overwriting a file in an existing version.
export default function UploadDialog({ model, open, onClose, onUploaded }: {
  model: string,
  open: boolean,
  onClose: () => void,
  onUploaded?: () => void,
}) {
  const notify = useNotify();
  const [disk, setDisk] = useState<RepositoryModel | null>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [mode, setMode] = useState<Mode>('new');
  const [version, setVersion] = useState<string>('1');
  const [fileName, setFileName] = useState<string>('model.onnx');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>('');

  const versions = disk?.versions || [];
  const latest = versions[versions.length - 1];
  const nextVersion = String(latest ? Number(latest.version) + 1 : 1);
  const filesIn = (v: string) => (versions.find((x) => x.version === v)?.files || []).filter((f) => f.size !== null);
  const mainFile = (v?: string) => (v && filesIn(v)[0]?.name) || 'model.onnx';

  useEffect(() => {
    if (!open) return;
    setDisk(null);
    setLoadError('');
    setError('');
    setFile(null);
    apiFetch('/api/repository')
      .then((res) => res.json())
      .then((models: RepositoryModel[]) => {
        const found = models.find((m) => m.name === model);
        if (!found) throw new Error(`Folder "${model}" not found in the model repository`);
        const last = found.versions[found.versions.length - 1];
        setDisk(found);
        setMode('new');
        setVersion(String(last ? Number(last.version) + 1 : 1));
        setFileName((last && last.files.find((f) => f.size !== null)?.name) || 'model.onnx');
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [open, model]);

  const changeMode = (value: Mode) => {
    setMode(value);
    if (value === 'new') {
      setVersion(nextVersion);
      setFileName(mainFile(latest?.version));
    } else {
      setVersion(latest.version);
      setFileName(mainFile(latest.version));
    }
  };

  const versionExists = versions.some((v) => v.version === version);
  const versionError = !/^[0-9]+$/.test(version) ? 'Must be a number'
    : mode === 'new' && versionExists ? 'Version already exists' : '';
  const fileNameError = !NAME_PATTERN.test(fileName) ? 'Invalid file name' : '';
  const canSave = disk && file && !versionError && !fileNameError && !saving;

  const upload = async () => {
    if (!file) return;
    setError('');
    setSaving(true);
    setProgress(0);
    try {
      await uploadModelFile(model, version, fileName, file, setProgress);
      notify(mode === 'new'
        ? `Uploaded ${model} version ${version}. Triton loads it on its next repository poll.`
        : `Replaced ${model}/${version}/${fileName}. Triton reloads it on its next repository poll.`);
      onUploaded?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
    setProgress(null);
    setSaving(false);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 600 }}>Upload model file · {model}</DialogTitle>
      <DialogContent>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {!disk && !loadError && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>}

        {disk && (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {versions.length > 0 && (
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={mode}
                onChange={(_, value) => value && changeMode(value)}
                disabled={saving}
              >
                <ToggleButton value="new">Upload as new version</ToggleButton>
                <ToggleButton value="replace">Replace existing file</ToggleButton>
              </ToggleButtonGroup>
            )}

            {mode === 'new' ? (
              <Alert severity="info">
                Creates <code>{model}/{version}/</code>. With Triton&apos;s default version policy (latest 1), it starts serving
                this version and unloads the older one. {latest && <>Version {latest.version} stays on disk, so you can roll back.</>}
              </Alert>
            ) : (
              <Alert severity="warning">
                Overwrites <code>{model}/{version}/{fileName}</code>. You can&apos;t undo this. Triton reloads the model on its next repository poll.
              </Alert>
            )}

            <Stack direction="row" spacing={2}>
              {mode === 'new' ? (
                <TextField
                  label="Version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  error={!!versionError}
                  helperText={versionError || ' '}
                  disabled={saving}
                  sx={{ width: 120 }}
                />
              ) : (
                <TextField
                  select
                  label="Version"
                  value={version}
                  onChange={(e) => {
                    setVersion(e.target.value);
                    setFileName(mainFile(e.target.value));
                  }}
                  helperText=" "
                  disabled={saving}
                  sx={{ width: 120 }}
                >
                  {versions.map((v) => <MenuItem key={v.version} value={v.version}>{v.version}</MenuItem>)}
                </TextField>
              )}

              {mode === 'replace' && filesIn(version).length > 0 ? (
                <TextField
                  select
                  label="File to replace"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  helperText=" "
                  disabled={saving}
                  sx={{ flex: 1 }}
                >
                  {filesIn(version).map((f) => <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>)}
                </TextField>
              ) : (
                <TextField
                  label="Save as"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  error={!!fileNameError}
                  helperText={fileNameError || 'Must match the file name the backend expects'}
                  disabled={saving}
                  sx={{ flex: 1 }}
                />
              )}
            </Stack>

            <FileDrop file={file} onChange={setFile} disabled={saving} />

            {progress !== null && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Uploading… {progress}%</Typography>
                <LinearProgress variant="determinate" value={progress} />
              </Box>
            )}

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          color={mode === 'replace' ? 'warning' : 'primary'}
          loading={saving}
          disabled={!canSave}
          onClick={upload}
        >
          {mode === 'new' ? 'Upload version' : 'Replace file'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
