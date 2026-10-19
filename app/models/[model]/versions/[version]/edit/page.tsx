'use client'

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Alert, Breadcrumbs, Button, Container, Paper, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import SaveIcon from '@mui/icons-material/Save';
import { useNotify } from '@/components/Notify';
import { apiFetch, errorMessage } from '@/api/client';

// 'disk' edits config.pbtxt in the model repository (works with Triton's poll mode).
// 'override' sends a JSON config with a load request (needs Triton's explicit mode).
type EditMode = 'disk' | 'override';

function ModelEdit(props: { params: Promise<{ model: string, version: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const notify = useNotify();
  const { model, version } = params;
  const [mode, setMode] = useState<EditMode | null>(null);
  const [config, setConfig] = useState<string>('');
  const [original, setOriginal] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const backHref = `/models/${model}/versions/${version}`;
  const dirty = config !== original;

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      if (mode === 'disk') {
        await apiFetch(`/api/repository/${model}/config`, { method: 'PUT', body: config });
        notify('Saved config.pbtxt. Triton reloads the model on its next repository poll.');
      } else {
        await apiFetch(`/api/models/${model}/load`, {
          method: 'POST',
          body: JSON.stringify({ parameters: { config } }),
        });
        notify(`${model} reloaded with the new config`);
      }
      router.push('/repo');
    } catch (err) {
      setError(errorMessage(err));
    }
    setSaving(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/repository/${model}/config`);
        const text = await res.text();
        setMode('disk');
        setConfig(text);
        setOriginal(text);
        return;
      } catch {}

      try {
        const res = await apiFetch(`/api/models/${model}/versions/${version}`);
        const { config } = await res.json();
        const text = JSON.stringify(config, null, 4);
        setMode('override');
        setConfig(text);
        setOriginal(text);
      } catch (err) {
        setError(errorMessage(err));
      }
    })()
  }, [model, version]);

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 6 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link href="/repo"><Typography color="text.secondary" sx={{ '&:hover': { textDecoration: 'underline' } }}>Models</Typography></Link>
        <Link href={backHref}><Typography color="text.secondary" sx={{ '&:hover': { textDecoration: 'underline' } }}>{model}</Typography></Link>
        <Typography color="text.primary">Edit config</Typography>
      </Breadcrumbs>

      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            justifyContent: "space-between",
            alignItems: { sm: "center" }
          }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>{model}</Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => router.push(backHref)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              loading={saving}
              disabled={!mode || !dirty}
              onClick={save}
            >
              Save
            </Button>
          </Stack>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {mode === 'disk' && (
          <Alert severity="info">
            Editing <code>{model}/config.pbtxt</code> in the model repository. Triton picks up the change on its next poll.
          </Alert>
        )}
        {mode === 'override' && (
          <Alert severity="info">
            The repository folder is not accessible, so this JSON config is sent with a load request. This requires Triton&apos;s explicit model control mode.
          </Alert>
        )}

        {!mode && !error && <Skeleton variant="rounded" height={500} />}

        {mode && (
          <Paper sx={{ p: 0.5 }}>
            <TextField
              fullWidth
              multiline
              minRows={24}
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              variant="standard"
              slotProps={{
                input: { disableUnderline: true, sx: { p: 2 } },
                htmlInput: { spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 } },
              }}
            />
          </Paper>
        )}
      </Stack>
    </Container>
  );
}

export default ModelEdit;
