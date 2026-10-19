'use client'

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppBar, Box, Button, Chip, IconButton, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import CircleIcon from '@mui/icons-material/Circle';
import { apiFetch } from '@/api/client';

type ServerStatus = { name: string, version: string, ready: boolean } | { error: string } | null;

function ServerStatusChip() {
  const [status, setStatus] = useState<ServerStatus>(null);

  useEffect(() => {
    const check = async () => {
      try {
        setStatus(await (await apiFetch('/api/server')).json());
      } catch (err) {
        setStatus({ error: 'Triton unreachable' });
      }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, []);

  if (!status) return null;

  const ok = !('error' in status) && status.ready;
  const label = 'error' in status
    ? status.error
    : `Triton ${status.version} · ${status.ready ? 'ready' : 'not ready'}`;

  return (
    <Chip
      size="small"
      icon={<CircleIcon sx={{ fontSize: 10, color: ok ? '#4ade80 !important' : '#f87171 !important' }} />}
      label={label}
      sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit', display: { xs: 'none', sm: 'flex' } }}
    />
  );
}

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  if (!mode) return null;
  const current = mode === 'system' ? systemMode : mode;

  return (
    <Tooltip title={current === 'dark' ? 'Light mode' : 'Dark mode'}>
      <IconButton color="inherit" onClick={() => setMode(current === 'dark' ? 'light' : 'dark')}>
        {current === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}

export default function Navigation() {
  const pathname = usePathname();

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar
        position="sticky"
        sx={{ background: 'linear-gradient(90deg, #312e81 0%, #4f46e5 100%)' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Link href="/">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ bgcolor: '#fff', borderRadius: 1.5, px: 1, py: 0.5, display: 'flex' }}>
                <Box
                  component="img"
                  src={`${process.env.NEXT_PUBLIC_WEBUI_BASEPATH || ''}/logo.png`}
                  alt="REC"
                  sx={{ height: 36, width: 'auto', display: 'block' }}
                />
              </Box>
              <Typography variant="h6" component="div" sx={{ fontWeight: 600, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
                Inference Server Model Manager
              </Typography>
            </Stack>
          </Link>

          <Box sx={{ flexGrow: 1 }} />

          <ServerStatusChip />

          <Link href="/repo">
            <Button
              color="inherit"
              sx={{ bgcolor: pathname?.startsWith('/repo') || pathname?.startsWith('/models') ? 'rgba(255,255,255,0.15)' : undefined }}
            >
              Models
            </Button>
          </Link>

          <ThemeToggle />
        </Toolbar>
      </AppBar>
    </Box>
  )
}
