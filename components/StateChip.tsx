import { Chip, ChipProps } from '@mui/material';

const colors: Record<string, ChipProps['color']> = {
  READY: 'success',
  LOADING: 'info',
  UNLOADING: 'warning',
  UNAVAILABLE: 'error',
  DISABLED: 'default',
};

export default function StateChip({ state, size = 'small' }: { state?: string, size?: ChipProps['size'] }) {
  if (!state) return null;
  return (
    <Chip
      size={size}
      label={state}
      color={colors[state] || 'default'}
      variant={state === 'READY' ? 'filled' : 'outlined'}
      sx={{ fontWeight: 600, letterSpacing: 0.3 }}
    />
  );
}
