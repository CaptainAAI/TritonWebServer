'use client'

import React, { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Container, Paper, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import EditIcon from '@mui/icons-material/Edit';
import StopIcon from '@mui/icons-material/Stop';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import StateChip from '@/components/StateChip';
import UploadDialog from '@/components/UploadDialog';
import { useUnload } from '@/components/UnloadDialog';
import EnsembleInfo from '@/components/EnsembleInfo';
import DetectTest from '@/components/DetectTest';
import { apiFetch, errorMessage } from '@/api/client';
import { formatBytes, RepositoryModel } from '@/types/repository';
import { isImageEnsemble } from '@/types/ensemble';

const STATS_REFRESH_MS = 5000;

type Tensor = { name: string, data_type: string, dims: (number | string)[], format?: string };

function formatDuration(ns: number, count: number) {
  if (!count) return '—';
  const ms = ns / count / 1e6;
  return ms >= 100 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(2)} ms`;
}

function SummaryCard({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2, flex: 1, minWidth: 150 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{value}</Typography>
    </Paper>
  );
}

function TensorTable({ title, tensors }: { title: string, tensors?: Tensor[] }) {
  return (
    <Paper sx={{ flex: 1, minWidth: 300 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, px: 2, pt: 2, pb: 1 }}>{title}</Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Shape</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(tensors || []).map((tensor) => (
              <TableRow key={tensor.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{tensor.name}</TableCell>
                <TableCell><Chip size="small" variant="outlined" label={tensor.data_type.replace(/^TYPE_/, '')} /></TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>[{tensor.dims.join(', ')}]</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function KeyValueTable({ data }: { data: Record<string, any> }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableBody>
          {Object.entries(data).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontWeight: 500, width: 240, verticalAlign: 'top' }}>{key}</TableCell>
              <TableCell sx={{ whiteSpace: 'pre', fontFamily: typeof value === 'object' ? 'monospace' : undefined, fontSize: 13 }}>
                {value !== undefined && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ModelView(props: { params: Promise<{ model: string, version: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const { model, version } = params;
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [rawConfig, setRawConfig] = useState<string | null>(null);
  const [disk, setDisk] = useState<RepositoryModel | null>(null);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { unload, busy: isUnloading, dialog: unloadDialog } = useUnload(model, () => router.replace('/repo'));

  const getModel = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/models/${model}/versions/${version}`);
      const { config, stats } = await res.json();
      setConfig(config);
      setStats(stats);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [model, version]);

  const getDisk = useCallback(() => {
    apiFetch('/api/repository').then((res) => res.json())
      .then((models: RepositoryModel[]) => setDisk(models.find((m) => m.name === model) || null))
      .catch(() => {});
  }, [model]);

  useEffect(() => {
    getModel();
    const timer = setInterval(getModel, STATS_REFRESH_MS);

    // Disk details are optional: they need MODEL_REPOSITORY_PATH on the web UI server.
    apiFetch(`/api/repository/${model}/config`).then((res) => res.text()).then(setRawConfig).catch(() => {});
    getDisk();

    return () => clearInterval(timer);
  }, [model, version, getModel, getDisk]);

  const inferenceStats = stats?.inference_stats || {};
  const success = inferenceStats.success || { count: 0, ns: 0 };
  const lastInference = stats?.last_inference ? new Date(stats.last_inference).toLocaleString() : 'Never';
  const files = disk?.versions.find((v) => v.version === version)?.files || [];
  const isEnsemble = config?.platform === 'ensemble';
  const canTest = !!config && isImageEnsemble(config);

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 6 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link href="/repo"><Typography color="text.secondary" sx={{ '&:hover': { textDecoration: 'underline' } }}>Models</Typography></Link>
        <Typography color="text.primary">{model}</Typography>
        <Typography color="text.primary">v{version}</Typography>
      </Breadcrumbs>

      {error && !config && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push('/repo')}>Back</Button>}>
          {error}
        </Alert>
      )}

      {!config && !error && (
        <Stack spacing={2}>
          <Skeleton variant="text" width={240} height={48} />
          <Skeleton variant="rounded" height={90} />
          <Skeleton variant="rounded" height={240} />
        </Stack>
      )}

      {config && stats && (
        <Stack spacing={3}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              justifyContent: "space-between",
              alignItems: { sm: "center" }
            }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>{config.name}</Typography>
              <StateChip state="READY" />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() => router.push(`/models/${model}/versions/${version}/edit`)}
                startIcon={<EditIcon />}
              >
                Edit config
              </Button>
              {!isEnsemble && (
                <Button variant="outlined" onClick={() => setUploadOpen(true)} startIcon={<UploadFileIcon />}>
                  Upload file
                </Button>
              )}
              <Button onClick={unload} loading={isUnloading} variant="outlined" color="warning" startIcon={<StopIcon />}>
                Unload
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <SummaryCard label="Platform" value={config.platform || config.backend || '—'} />
            <SummaryCard label="Max batch size" value={config.max_batch_size || 'No batching'} />
            <SummaryCard label="Inferences" value={(stats.inference_count || 0).toLocaleString()} />
            <SummaryCard label="Avg latency" value={formatDuration(success.ns, success.count)} />
            <SummaryCard label="Last inference" value={<Typography component="span" sx={{ fontWeight: 600 }}>{lastInference}</Typography>} />
          </Stack>

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
              <Tab label="Overview" />
              <Tab label="Statistics" />
              <Tab label="Config" />
              {canTest && <Tab label="Test" />}
            </Tabs>
          </Box>

          {activeTab === 0 && (
            <Stack spacing={3}>
              <EnsembleInfo model={model} config={config} />

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                <TensorTable title="Inputs" tensors={config.input} />
                <TensorTable title="Outputs" tensors={config.output} />
              </Stack>

              {!!config.instance_group?.length && (
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Instances</Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {config.instance_group.map((group: any, i: number) => (
                      <Chip
                        key={i}
                        label={`${group.count ?? 1} × ${String(group.kind).replace(/^KIND_/, '')}${group.gpus?.length ? ` (GPU ${group.gpus.join(', ')})` : ''}`}
                      />
                    ))}
                  </Stack>
                </Paper>
              )}

              {files.length > 0 && (
                <Paper>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, px: 2, pt: 2, pb: 1 }}>
                    Files in {model}/{version}/
                  </Typography>
                  <Table size="small">
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={file.name}>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{file.name}</TableCell>
                          <TableCell align="right">{formatBytes(file.size)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              )}
            </Stack>
          )}

          {activeTab === 1 && (
            <Stack spacing={3}>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Stage</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">Avg time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(inferenceStats).map(([stage, value]: [string, any]) => (
                      <TableRow key={stage}>
                        <TableCell>{stage.replace(/_/g, ' ')}</TableCell>
                        <TableCell align="right">{Number(value.count).toLocaleString()}</TableCell>
                        <TableCell align="right">{formatDuration(value.ns, value.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="body2" color="text.secondary">
                Refreshes every {STATS_REFRESH_MS / 1000}s. Raw statistics:
              </Typography>
              <KeyValueTable data={stats} />
            </Stack>
          )}

          {activeTab === 2 && (
            rawConfig !== null ? (
              <Paper sx={{ p: 2, overflowX: 'auto' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>config.pbtxt on disk</Typography>
                <Box component="pre" sx={{ m: 0, fontSize: 13, fontFamily: 'monospace' }}>{rawConfig}</Box>
              </Paper>
            ) : (
              <KeyValueTable data={config} />
            )
          )}

          {activeTab === 3 && canTest && <DetectTest model={model} />}
        </Stack>
      )}

      <UploadDialog model={model} open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={getDisk} />
      {unloadDialog}

      {config && error && (
        <Alert severity="warning" sx={{ mt: 3 }}>Refresh failed, showing last known data: {error}</Alert>
      )}
    </Container>
  );
}

export default ModelView;
