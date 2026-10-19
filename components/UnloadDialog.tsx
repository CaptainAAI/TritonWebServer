'use client'

import React, { useState } from 'react';
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import { useNotify } from '@/components/Notify';
import { apiFetch, errorMessage } from '@/api/client';
import { dependentsOf, Ensemble } from '@/types/ensemble';

// Unloads `model`, but first checks which loaded ensembles call it. If any do,
// asks whether to unload only the model or those ensembles too.
// Render the returned `dialog`; `onDone` runs once something was unloaded.
export function useUnload(model: string, onDone: () => void) {
  const notify = useNotify();
  const [busy, setBusy] = useState<boolean>(false);
  const [dependents, setDependents] = useState<string[]>([]);
  const [open, setOpen] = useState<boolean>(false);

  const unloadAll = async (names: string[]) => {
    setBusy(true);
    const done: string[] = [];
    let viaFolder = false;
    try {
      for (const name of names) {
        const res = await (await apiFetch(`/api/models/${name}/unload`, { method: 'POST' })).json();
        viaFolder = res.via === 'folder';
        done.push(name);
      }
      notify(viaFolder
        ? `${done.join(', ')} moved to disabled_models/. Triton unloads ${done.length > 1 ? 'them' : 'it'} within a few seconds.`
        : `${done.join(', ')} unloaded`);
    } catch (err) {
      notify(`Unload failed${done.length ? ` after unloading ${done.join(', ')}` : ''}: ${errorMessage(err)}`, 'error');
    }
    setBusy(false);
    setOpen(false);
    if (done.length) onDone();
  };

  const unload = async () => {
    setBusy(true);
    let found: string[] = [];
    try {
      const ensembles: Ensemble[] = await (await apiFetch('/api/ensembles')).json();
      found = dependentsOf(model, ensembles);
    } catch {
      // Without the ensemble list there is nothing to warn about; unload as before.
    }
    if (found.length) {
      setDependents(found);
      setOpen(true);
      setBusy(false);
      return;
    }
    await unloadAll([model]);
  };

  const dialog = (
    <Dialog open={open} onClose={busy ? undefined : () => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 600 }}>Unload {model}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            {dependents.length === 1 ? 'This ensemble calls' : `These ${dependents.length} ensembles call`} <b>{model}</b> and
            stop working without it:
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {dependents.map((name) => <Chip key={name} label={name} icon={<AccountTreeOutlinedIcon />} />)}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button color="warning" onClick={() => unloadAll([model])} disabled={busy}>
          Unload {model} only
        </Button>
        <Button variant="contained" color="warning" loading={busy} onClick={() => unloadAll([...dependents, model])}>
          Unload all {dependents.length + 1}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { unload, busy, dialog };
}
