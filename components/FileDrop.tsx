'use client'

import React, { useRef, useState } from 'react';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { formatBytes } from '@/types/repository';

// Drag-and-drop / click-to-browse file picker that shows the chosen file once picked.
export default function FileDrop({ file, onChange, disabled, hint, label = 'Drop a model file here, or click to browse', accept }: {
  file: File | null,
  onChange: (file: File | null) => void,
  disabled?: boolean,
  hint?: string,
  label?: string,
  accept?: string,
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<boolean>(false);

  return (
    <>
      {file ? (
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <InsertDriveFileOutlinedIcon color="primary" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 500 }}>{file.name}</Typography>
            <Typography variant="body2" color="text.secondary">{formatBytes(file.size)}</Typography>
          </Box>
          <IconButton onClick={() => onChange(null)} disabled={disabled}><CloseIcon /></IconButton>
        </Paper>
      ) : (
        <Box
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files[0]) onChange(e.dataTransfer.files[0]);
          }}
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: dragging ? 'primary.main' : 'divider',
            bgcolor: dragging ? 'action.hover' : 'transparent',
            borderRadius: 2,
            p: 5,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all .15s',
            '&:hover': { borderColor: 'primary.main' },
          }}
        >
          <CloudUploadOutlinedIcon sx={{ fontSize: 44, color: 'primary.main', mb: 1 }} />
          <Typography sx={{ fontWeight: 500 }}>{label}</Typography>
          {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
        </Box>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) onChange(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}
