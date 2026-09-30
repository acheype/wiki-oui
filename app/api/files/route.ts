import { listFiles, receiveFile } from "@/modules/files/library";

// XHR needs this transport to expose upload progress (ADR 0012).
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const result = await receiveFile(file instanceof File ? file : null);
  return "error" in result
    ? Response.json({ error: result.error }, { status: result.status })
    : Response.json(result);
}

export async function GET(request: Request) {
  const family = new URL(request.url).searchParams.get("family");
  return Response.json({ files: await listFiles(family) });
}
