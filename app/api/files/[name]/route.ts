import { deliverFile } from "@/modules/files/delivery";

type Params = { params: Promise<{ name: string }> };

export async function GET(request: Request, { params }: Params) {
  return deliverFile(request, (await params).name);
}
