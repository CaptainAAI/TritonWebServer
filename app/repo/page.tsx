'use client'

import ModelItem from '@/components/ModelItem';
import TableRowsLoader from '@/components/TableRowsLoader';
import { Model } from '@/types/model';
import { Alert, Box, Button, Container, IconButton, InputAdornment, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/api/client';

// Triton polls the repository, so new/changed models show up on their own; follow along.
const AUTO_REFRESH_MS = 10000;

type StateFilter = 'all' | 'ready' | 'not-ready';

function StatCard({ label, value, color, active, onClick }: {
  label: string, value: number | string, color?: string, active?: boolean, onClick?: () => void,
}) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2.5,
        flex: 1,
        minWidth: 140,
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? 'primary.main' : undefined,
        transition: 'border-color .15s',
        '&:hover': onClick ? { borderColor: 'primary.main' } : undefined,
      }}
    >
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 600, color }}>{value}</Typography>
    </Paper>
  );
}

const columns: { key: keyof Model, label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'version', label: 'Version' },
  { key: 'state', label: 'State' },
  { key: 'reason', label: 'Reason' },
];

function App() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<keyof Model>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  const getModels = useCallback(async () => {
    try {
      const res = await apiFetch('/api/models', { method: 'POST' });
      setModels(await res.json());
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await getModels();
    setRefreshing(false);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await getModels();
      setLoading(false);
    })();
    const timer = setInterval(getModels, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [getModels]);

  const handleSort = (column: keyof Model) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  const readyCount = models.filter((model) => model.state === 'READY').length;

  const sortedModels = [...models].sort((a, b) => {
    const columnA = a[sortColumn] || '';
    const columnB = b[sortColumn] || '';
    const order = columnA.localeCompare(columnB, undefined, { numeric: true });
    return sortDirection === 'asc' ? order : -order;
  }).filter((model) => {
    if (stateFilter === 'ready' && model.state !== 'READY') return false;
    if (stateFilter === 'not-ready' && model.state === 'READY') return false;
    return model.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const toggleFilter = (filter: StateFilter) => setStateFilter(stateFilter === filter ? 'all' : filter);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: 'stretch', sm: 'center' },
          mb: 3
        }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>Models</Typography>
          <Typography variant="body2" color="text.secondary">
            Models in the Triton repository · refreshes every {AUTO_REFRESH_MS / 1000}s
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Tooltip title="Refresh now">
            <span>
              <IconButton onClick={refresh} disabled={refreshing || loading}>
                <RefreshIcon sx={refreshing ? { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } } : undefined} />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => router.push('/repo/new')}>
            Add model
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 3, flexWrap: 'wrap' }}>
        <StatCard label="Total" value={loading ? '–' : models.length} active={stateFilter === 'all'} onClick={() => setStateFilter('all')} />
        <StatCard label="Ready" value={loading ? '–' : readyCount} color="var(--mui-palette-success-main)" active={stateFilter === 'ready'} onClick={() => toggleFilter('ready')} />
        <StatCard label="Not ready" value={loading ? '–' : models.length - readyCount} color={models.length - readyCount ? 'var(--mui-palette-error-main)' : undefined} active={stateFilter === 'not-ready'} onClick={() => toggleFilter('not-ready')} />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={refresh}>Retry</Button>}>
          Could not load models: {error}
        </Alert>
      )}

      <Paper>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <TextField
            placeholder="Search models"
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: 260 }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              },
            }}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={stateFilter}
            onChange={(_, value) => value && setStateFilter(value)}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="ready">Ready</ToggleButton>
            <ToggleButton value="not-ready">Not ready</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {columns.map(({ key, label }) => (
                  <TableCell key={key}>
                    <TableSortLabel
                      active={sortColumn === key}
                      direction={sortDirection}
                      onClick={() => handleSort(key)}
                    >
                      {label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRowsLoader rowsNum={3} columnsNum={5} />
              ) : sortedModels.length ? sortedModels.map((model) => (
                <ModelItem key={`${model.name}/${model.version}`} model={model} update={getModels} />
              )) : (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Stack spacing={1} sx={{ alignItems: 'center', py: 6, color: 'text.secondary' }}>
                      <Inventory2OutlinedIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                      <Typography>
                        {models.length ? 'No models match your filters' : 'No models in the repository yet'}
                      </Typography>
                      {!models.length && !error && (
                        <Button startIcon={<AddIcon />} onClick={() => router.push('/repo/new')}>Add your first model</Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
}

export default App;
