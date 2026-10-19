'use client'

import React, { useState } from 'react';
import { Model } from '@/types/model';
import Link from 'next/link';
import { CircularProgress, IconButton, Stack, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useRouter } from 'next/navigation';
import StateChip from '@/components/StateChip';
import { useNotify } from '@/components/Notify';
import UploadDialog from '@/components/UploadDialog';
import { useUnload } from '@/components/UnloadDialog';
import { apiFetch, errorMessage } from '@/api/client';

// Describes what a load/unload did. In poll mode the server moves or touches folders
// instead of calling Triton, and Triton applies the change on its next repository poll.
export function actionMessage(name: string, action: 'load' | 'unload', res: { via?: string, action?: string }) {
  if (res.via !== 'folder') return `${name} ${action === 'load' ? 'loaded' : 'unloaded'}`;
  if (action === 'unload') return `${name} moved to disabled_models/. Triton unloads it within a few seconds.`;
  if (res.action === 'enabled') return `${name} moved back into the repository. Triton loads it within a few seconds.`;
  return `${name} marked as changed. Triton reloads it within a few seconds.`;
}

function ModelItem({ model, update }: { model: Model, update: () => Promise<void> }) {
  const router = useRouter();
  const notify = useNotify();
  const [busy, setBusy] = useState<'load' | 'unload' | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { unload, busy: unloading, dialog: unloadDialog } = useUnload(model.name, update);

  const run = async (action: 'load' | 'unload') => {
    setBusy(action);
    try {
      const res = await (await apiFetch(`/api/models/${model.name}/${action}`, { method: 'POST' })).json();
      notify(actionMessage(model.name, action, res));
    } catch (err) {
      notify(`${action === 'load' ? 'Load' : 'Unload'} failed: ${errorMessage(err)}`, 'error');
    }
    await update();
    setBusy(null);
  };

  const isReady = model.state === 'READY';
  const isDisabled = model.state === 'DISABLED';
  const version = model.version || '1';
  const detailHref = `/models/${model.name}/versions/${version}`;

  return (
    <TableRow hover>
      <TableCell>
        {isReady ? (
          <Link href={detailHref}>
            <Typography sx={{ fontWeight: 500, color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
              {model.name}
            </Typography>
          </Link>
        ) : (
          <Typography sx={{ fontWeight: 500 }}>{model.name}</Typography>
        )}
      </TableCell>
      <TableCell>{model.version || '—'}</TableCell>
      <TableCell>
        <StateChip state={model.state} />
      </TableCell>
      <TableCell sx={{ maxWidth: 320 }}>
        {model.reason ? (
          <Tooltip title={model.reason}>
            <Typography variant="body2" color="error" noWrap>{model.reason}</Typography>
          </Tooltip>
        ) : (
          <Typography variant="body2" color="text.disabled">—</Typography>
        )}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {isReady && (
            <Tooltip title="Details">
              <IconButton size="small" onClick={() => router.push(detailHref)}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!isDisabled && (
            <>
              <Tooltip title="Upload / replace model file">
                <IconButton size="small" onClick={() => setUploadOpen(true)}>
                  <UploadFileIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit config">
                <IconButton size="small" onClick={() => router.push(`${detailHref}/edit`)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip title={isReady ? 'Reload' : 'Load'}>
            <span>
              <IconButton size="small" color="primary" disabled={!!busy || unloading} onClick={() => run('load')}>
                {busy === 'load' ? <CircularProgress size={18} /> : isReady ? <RefreshIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          {isReady && (
            <Tooltip title="Unload">
              <span>
                <IconButton size="small" color="warning" disabled={!!busy || unloading} onClick={unload}>
                  {unloading ? <CircularProgress size={18} /> : <StopIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
        <UploadDialog model={model.name} open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={update} />
        {unloadDialog}
      </TableCell>
    </TableRow>
  );
}

export default ModelItem;
