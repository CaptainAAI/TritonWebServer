'use client'

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import StateChip from '@/components/StateChip';
import { apiFetch } from '@/api/client';
import { Model } from '@/types/model';
import { Ensemble, EnsembleStep } from '@/types/ensemble';

function modelHref(name: string, models: Model[]) {
  const found = models.find((m) => m.name === name);
  return found?.state === 'READY' ? `/models/${name}/versions/${found.version}` : null;
}

function Arrow() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
      <ArrowForwardIcon sx={{ transform: { xs: 'rotate(90deg)', md: 'none' } }} />
    </Box>
  );
}

function Endpoint({ label, names }: { label: string, names: string[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 120, bgcolor: 'action.hover' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {names.map((name) => (
        <Typography key={name} sx={{ fontFamily: 'monospace', fontSize: 13 }}>{name}</Typography>
      ))}
    </Paper>
  );
}

// key = the step model's tensor, value = the ensemble's tensor it is connected to.
function TensorMap({ map, arrow }: { map?: Record<string, string>, arrow: string }) {
  return (
    <>
      {Object.entries(map || {}).map(([key, value]) => (
        <Typography key={key} sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>
          {key} {arrow} {value}
        </Typography>
      ))}
    </>
  );
}

function StepCard({ index, step, models }: { index: number, step: EnsembleStep, models: Model[] }) {
  const href = modelHref(step.model_name, models);
  const state = models.find((m) => m.name === step.model_name)?.state;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 180 }}>
      <Typography variant="caption" color="text.secondary">Step {index + 1}</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
        {href ? (
          <Link href={href}>
            <Typography sx={{ fontWeight: 600, color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
              {step.model_name}
            </Typography>
          </Link>
        ) : (
          <Typography sx={{ fontWeight: 600 }}>{step.model_name}</Typography>
        )}
        <StateChip state={state} />
      </Stack>
      <TensorMap map={step.input_map} arrow="←" />
      <TensorMap map={step.output_map} arrow="→" />
    </Paper>
  );
}

// Overview card. For an ensemble: its steps in order, each linked to its model.
// For any other model: the loaded ensembles that call it.
export default function EnsembleInfo({ model, config }: { model: string, config: Record<string, any> }) {
  const isEnsemble = config.platform === 'ensemble';
  const [models, setModels] = useState<Model[]>([]);
  const [ensembles, setEnsembles] = useState<Ensemble[]>([]);

  useEffect(() => {
    apiFetch('/api/models', { method: 'POST' }).then((res) => res.json()).then(setModels).catch(() => {});
    if (!isEnsemble) {
      apiFetch('/api/ensembles').then((res) => res.json()).then(setEnsembles).catch(() => {});
    }
  }, [model, isEnsemble]);

  if (isEnsemble) {
    const steps: EnsembleStep[] = config.ensemble_scheduling?.step || [];
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Pipeline</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Triton runs these models in order for every request; tensors are passed between them on the server.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <Endpoint label="Input" names={(config.input || []).map((t: { name: string }) => t.name)} />
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <Arrow />
              <StepCard index={i} step={step} models={models} />
            </React.Fragment>
          ))}
          <Arrow />
          <Endpoint label="Output" names={(config.output || []).map((t: { name: string }) => t.name)} />
        </Stack>
      </Paper>
    );
  }

  const users = ensembles.filter((e) => e.steps.some((step) => step.model_name === model));
  if (!users.length) return null;
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Used by</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Loaded ensembles that call {model}. Unloading {model} stops them working.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {users.map((e) => (
          <Chip
            key={e.name}
            label={e.name}
            icon={<AccountTreeOutlinedIcon />}
            component={Link}
            href={`/models/${e.name}/versions/${e.version}`}
            clickable
          />
        ))}
      </Stack>
    </Paper>
  );
}
