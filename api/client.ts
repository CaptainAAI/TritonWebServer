// Browser-side helper for calling this app's own /api routes.
// Throws an Error carrying the server's error message on non-2xx responses.
export async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch((process.env.NEXT_PUBLIC_WEBUI_BASEPATH || '') + path, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) {
        message = typeof body.error === 'string' ? tritonMessage(body.error) : JSON.stringify(body.error);
      }
    } catch {}
    throw new Error(message);
  }
  return res;
}

// Triton errors are proxied as JSON text, e.g. '{"error":"..."}'; unwrap them.
function tritonMessage(error: string) {
  try {
    return JSON.parse(error).error || error;
  } catch {
    return error;
  }
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

// Uploads a file into <model>/<version>/<fileName> in the model repository.
// XHR instead of fetch so upload progress can be shown for large model files.
export function uploadModelFile(model: string, version: string, fileName: string, file: File, onProgress: (percent: number) => void) {
  const url = (process.env.NEXT_PUBLIC_WEBUI_BASEPATH || '')
    + `/api/repository/${encodeURIComponent(model)}/versions/${encodeURIComponent(version)}/files/${encodeURIComponent(fileName)}`;

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try {
        reject(new Error(JSON.parse(xhr.responseText).error));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(file);
  });
}
