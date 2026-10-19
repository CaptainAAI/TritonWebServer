'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Chip, LinearProgress, Paper, Slider, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import FileDrop from '@/components/FileDrop';
import { apiFetch, errorMessage } from '@/api/client';
import { DetectResult } from '@/types/ensemble';

// One colour per class id, readable on photos in both themes.
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];
const colorOf = (classId: number) => COLORS[classId % COLORS.length];

function Threshold({ label, value, onChange, onCommit, disabled }: {
  label: string, value: number, onChange: (v: number) => void, onCommit: (v: number) => void, disabled?: boolean,
}) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="body2" color="text.secondary">{label}: <b>{value.toFixed(2)}</b></Typography>
      <Slider
        size="small"
        min={0.05}
        max={0.95}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(_, v) => onChange(v as number)}
        onChangeCommitted={(_, v) => onCommit(v as number)}
      />
    </Box>
  );
}

// Test tab of an image ensemble: sends a JPEG/PNG file as is to /api/models/<model>/detect
// (pre-processing runs on Triton, post-processing in the web UI server) and draws the boxes.
export default function DetectTest({ model }: { model: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [conf, setConf] = useState<number>(0.25);
  const [iou, setIou] = useState<number>(0.45);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const imageUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const run = async (image: File, conf: number, iou: number) => {
    setRunning(true);
    setError('');
    try {
      const res = await apiFetch(`/api/models/${encodeURIComponent(model)}/detect?conf=${conf}&iou=${iou}`, { method: 'POST', body: image });
      setResult(await res.json());
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    }
    setRunning(false);
  };

  const pick = (picked: File | null) => {
    setFile(picked);
    setResult(null);
    setError('');
    if (picked) run(picked, conf, iou);
  };

  const lb = result?.letterbox;
  const fontSize = lb ? Math.max(lb.width, lb.height) / 70 : 0;

  return (
    <Stack spacing={3}>
      <Alert severity="info">
        The file is sent as is, like TritonVision <code>DetectImage()</code>: decoding and letterboxing run on Triton
        (DALI), the confidence filter and NMS in the web UI server. JPEG or PNG only.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4}>
        <Threshold label="Confidence" value={conf} onChange={setConf} onCommit={(v) => file && run(file, v, iou)} disabled={running} />
        <Threshold label="NMS IoU" value={iou} onChange={setIou} onCommit={(v) => file && run(file, conf, v)} disabled={running} />
      </Stack>

      <FileDrop
        file={file}
        onChange={pick}
        disabled={running}
        label="Drop a JPEG or PNG image here, or click to browse"
        accept="image/jpeg,image/png"
      />

      {error && <Alert severity="error">{error}</Alert>}

      {imageUrl && (
        <Paper sx={{ p: 1, overflow: 'hidden' }}>
          <Box sx={{ position: 'relative', lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing for next/image to optimise */}
            <img src={imageUrl} alt={file?.name || ''} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />
            {result && lb && (
              <svg
                viewBox={`0 0 ${lb.width} ${lb.height}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                {result.detections.map((d, i) => {
                  const [x, y, w, h] = d.box;
                  const text = `${d.class_id} ${d.score.toFixed(2)}`;
                  const labelY = y > fontSize * 1.4 ? y - fontSize * 1.4 : y;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={w} height={h} fill="none" stroke={colorOf(d.class_id)} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                      <rect x={x} y={labelY} width={fontSize * 0.62 * text.length + fontSize * 0.6} height={fontSize * 1.4} fill={colorOf(d.class_id)} />
                      <text x={x + fontSize * 0.3} y={labelY + fontSize * 1.05} fontSize={fontSize} fill="#fff" fontFamily="monospace">{text}</text>
                    </g>
                  );
                })}
              </svg>
            )}
            {running && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0 }} />}
          </Box>
        </Paper>
      )}

      {result && lb && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip color="primary" label={`${result.detections.length} detection${result.detections.length === 1 ? '' : 's'}`} />
            <Chip variant="outlined" label={`Triton ${result.infer_ms.toFixed(1)} ms (incl. DALI pre-processing)`} />
            <Chip variant="outlined" label={`Image ${lb.width} × ${lb.height}`} />
            <Chip variant="outlined" label={`Letterbox scale ${lb.scale.toFixed(4)}, pad ${lb.pad_x}, ${lb.pad_y}`} />
            <Chip variant="outlined" label={`${result.output.name} [${result.output.shape.join(', ')}]`} />
          </Stack>

          {result.detections.length > 0 && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell align="right">Score</TableCell>
                    <TableCell align="right">x</TableCell>
                    <TableCell align="right">y</TableCell>
                    <TableCell align="right">Width</TableCell>
                    <TableCell align="right">Height</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.detections.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: colorOf(d.class_id) }} />
                          <span>{d.class_id}</span>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{d.score.toFixed(3)}</TableCell>
                      {d.box.map((v, k) => <TableCell key={k} align="right" sx={{ fontFamily: 'monospace' }}>{v}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      )}
    </Stack>
  );
}
