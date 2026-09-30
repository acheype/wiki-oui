import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wikiConfig } from "@/wiki.config";

const permission = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/modules/pages/rights", () => ({ canContributeSomewhere: async () => permission.allowed }));
let directory: string;
let library: typeof import("./library");
let delivery: typeof import("./delivery");
let actions: typeof import("./upload/actions");
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "wikioui-files-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  library = await import("./library");
  delivery = await import("./delivery");
  actions = await import("./upload/actions");
});
beforeEach(async () => {
  permission.allowed = true;
  await rm(path.join(directory, "files"), { recursive: true, force: true });
  await mkdir(path.join(directory, "files"));
});
afterAll(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
const receive = (name: string, bytes = "content") => library.receiveFile(new File([bytes], name));
const serve = (name: string, query = "", headers?: HeadersInit) =>
  delivery.deliverFile(new Request(`http://wiki.test/api/files/${name}${query}`, { headers }), name);

describe("file library", () => {
  it("normalizes names, never overwrites, and lists actual disk files by family", async () => {
    expect(await receive("Mon Logo.PNG", "first")).toEqual({ name: "mon-logo.png", family: "image", size: 5 });
    expect(await receive("Mon Logo.PNG", "second")).toMatchObject({ name: "mon-logo-2.png" });
    await receive("notes.pdf");
    await writeFile(path.join(directory, "files", "copied.png"), "operator copy");
    await mkdir(path.join(directory, "files", "folder.png"));
    expect((await library.listFiles("image")).map((file) => file.name)).toEqual(["copied.png", "mon-logo-2.png", "mon-logo.png"]);
    expect(await readFile(path.join(directory, "files", "mon-logo.png"), "utf8")).toBe("first");
  });
  it("refuses contributions before any write", async () => {
    permission.allowed = false;
    expect(await receive("secret.pdf")).toMatchObject({ status: 403 });
    expect(await library.listFiles()).toEqual([]);
  });
  it("rejects missing files, extensions, and limits for each family", async () => {
    expect(await library.receiveFile(null)).toMatchObject({ status: 400 });
    expect(await receive("bad.exe")).toMatchObject({ status: 400 });
    for (const [name, size] of [["large.png", wikiConfig.upload.maxImageSize], ["large.pdf", wikiConfig.upload.maxFileSize]] as const) {
      expect(await library.receiveFile(new File([new Uint8Array(size + 1)], name))).toMatchObject({ status: 400 });
    }
    expect(await library.listFiles()).toEqual([]);
  });
  it("cancels a newly uploaded file, including an already removed file", async () => {
    await receive("new.pdf");
    await actions.discardUploadedFile("new.pdf");
    await actions.discardUploadedFile("new.pdf");
    expect(await library.listFiles()).toEqual([]);
  });
});

describe("file delivery", () => {
  it("returns 404 for missing, unapproved, and directory names", async () => {
    await writeFile(path.join(directory, "files", "bad.exe"), "bytes");
    await mkdir(path.join(directory, "files", "folder.png"));
    for (const name of ["missing.png", "bad.exe", "folder.png"]) expect((await serve(name)).status).toBe(404);
  });
  it("serves SVG sandboxed and other files as attachments", async () => {
    await receive("icon.svg", "<svg/>");
    await receive("notes.txt", "hello");
    const svg = await serve("icon.svg", "?w=100");
    expect(svg.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(svg.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await svg.text()).toBe("<svg/>");
    const attachment = await serve("notes.txt");
    expect(attachment.headers.get("Content-Disposition")).toBe('attachment; filename="notes.txt"');
    expect(attachment.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await attachment.text()).toBe("hello");
  });
  it("resizes real images inside the box without altering or enlarging the original", async () => {
    const bytes = await sharp({ create: { width: 80, height: 40, channels: 3, background: "red" } }).png().toBuffer();
    await library.receiveFile(new File([new Uint8Array(bytes)], "photo.png"));
    const small = await serve("photo.png", "?w=20&h=20");
    expect(await sharp(Buffer.from(await small.arrayBuffer())).metadata()).toMatchObject({ width: 20, height: 10 });
    const large = await serve("photo.png", "?w=200");
    expect(await sharp(Buffer.from(await large.arrayBuffer())).metadata()).toMatchObject({ width: 80, height: 40 });
    expect(Buffer.from(await (await serve("photo.png")).arrayBuffer())).toEqual(bytes);
  });
  it("serves an undecodable image unchanged instead of failing the request", async () => {
    await receive("broken.jpg", "not decodable");
    const response = await serve("broken.jpg", "?w=20");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("not decodable");
  });
  it("revalidates cached representations and detects a reused filename", async () => {
    await receive("cached.png", "old");
    const original = await serve("cached.png", "?w=20");
    const etag = original.headers.get("ETag")!;
    await original.arrayBuffer();
    expect(original.headers.get("Cache-Control")).toBe("no-cache");
    for (const match of [etag, `"other", W/${etag}`, "*"]) {
      const cached = await serve("cached.png", "?w=20", { "If-None-Match": match });
      expect(cached.status).toBe(304);
      expect(await cached.text()).toBe("");
    }
    await actions.discardUploadedFile("cached.png");
    await receive("cached.png", "different bytes");
    const replaced = await serve("cached.png", "?w=20", { "If-None-Match": etag });
    expect(replaced.status).toBe(200);
    expect(replaced.headers.get("ETag")).not.toBe(etag);
    expect(await replaced.text()).toBe("different bytes");
  });
});
