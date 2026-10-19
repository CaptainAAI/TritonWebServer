import fetchServer from "@/api/server";

// Server metadata plus readiness, for the status indicator in the app bar.
export async function GET() {
  try {
    const [metaRes, readyRes] = await Promise.all([
      fetchServer('v2', { cache: 'no-store' }),
      fetchServer('v2/health/ready', { cache: 'no-store' }),
    ]);

    if (!metaRes.ok) {
      const error = await metaRes.text();
      return Response.json({ error }, { status: metaRes.status });
    }

    const meta = await metaRes.json();
    return Response.json({
      name: meta.name,
      version: meta.version,
      ready: readyRes.ok,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Cannot reach Triton server' }, { status: 502 });
  }
}
