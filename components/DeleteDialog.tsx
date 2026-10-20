'use client'

import React, { useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import { useNotify } from '@/components/Notify';
import { apiFetch, errorMessage } from '@/api/client';
import { dependentsOf, Ensemble } from '@/types/ensemble';
import { RepositoryModel } from '@/types/repository';

// Deletes a model folder (or one version of it) from the model repository on disk.
// Asks first, and lists the loaded ensembles that call the model so they can be
// deleted with it. Render the returned `dialog`; `onDone` runs once something was deleted.
export function useDelete(model: string, version: string | undefined, onDone: () => void) {
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dependents, setDependents] = useState<string[]>([]);
  const [versionCount, setVersionCount] = useState(0);

  const ask = async () => {
    setOpen(true);
    setDependents([]);
    setVersionCount(0);
    try {
      const ensembles: Ensemble[] = await (await apiFetch('/api/ensembles')).json();
      setDependents(dependentsOf(model, ensembles));
    } catch {}
    try {
      const disk: RepositoryModel[] = await (await apiFetch('/api/repository')).json();
      setVersionCount(disk.find((m) => m.name === model)?.versions.length || 0);
    } catch {}
  };

  // Each request returns `leftover` when files owned by root could not be removed.
  const run = async (urls: string[], what: string) => {
    setBusy(true);
    try {
      const leftovers: string[] = [];
      for (const url of urls) {
        const res = await (await apiFetch(url, { method: 'DELETE' })).json();
        if (res.leftover) leftovers.push(res.leftover);
      }
      notify(leftovers.length
        ? `${what} deleted from the repository. Some files belong to root; remove them on the Jetson with: sudo rm -rf ${leftovers.join(' ')}`
        : `${what} deleted. Triton unloads it within a few seconds.`, leftovers.length ? 'warning' : 'success');
      setOpen(false);
      onDone();
    } catch (err) {
      notify(`Delete failed: ${errorMessage(err)}`, 'error');
    }
    setBusy(false);
  };

  const modelUrl = (name: string) => `/api/repository/${encodeURIComponent(name)}`;
  const canDeleteVersion = !!version && versionCount > 1;

  const dialog = (
    <Dialog open={open} onClose={busy ? undefined : () => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 600 }}>Delete {model}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning">
            The folder is deleted from the Jetson&apos;s model repository. This cannot be undone.
          </Alert>
          {canDeleteVersion && (
            <Typography>
              <b>{model}</b> has {versionCount} versions. Delete only version <b>{version}</b>, or the whole model.
            </Typography>
          )}
          {dependents.length > 0 && (
            <>
              <Typography>
                {dependents.length === 1 ? 'This ensemble calls' : `These ${dependents.length} ensembles call`} <b>{model}</b> and
                stop working without it:
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {dependents.map((name) => <Chip key={name} label={name} icon={<AccountTreeOutlinedIcon />} />)}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        {canDeleteVersion && (
          <Button color="error" disabled={busy}
            onClick={() => run([`${modelUrl(model)}/versions/${encodeURIComponent(version!)}`], `${model} version ${version}`)}>
            Delete version {version}
          </Button>
        )}
        <Button color="error" variant={dependents.length ? 'text' : 'contained'} loading={busy && !dependents.length}
          onClick={() => run([modelUrl(model)], model)}>
          Delete {model}{dependents.length ? ' only' : ''}
        </Button>
        {dependents.length > 0 && (
          <Button color="error" variant="contained" loading={busy}
            onClick={() => run([...dependents, model].map(modelUrl), [...dependents, model].join(', '))}>
            Delete all {dependents.length + 1}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );

  return { ask, dialog };
}
