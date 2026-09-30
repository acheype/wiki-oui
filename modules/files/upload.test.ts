import { beforeEach, describe, expect, it, vi } from "vitest";
const discard = vi.hoisted(() => vi.fn());
vi.mock("./upload/actions", () => ({ discardUploadedFile: discard }));
import { createUploadSession, uploadFile } from "./upload";

class UploadRequest {
  static requests: UploadRequest[] = [];
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  status = 200;
  responseText = "";
  open = vi.fn();
  send = vi.fn();
  constructor() { UploadRequest.requests.push(this); }
  finish(name: string, status = 200) {
    this.status = status;
    this.responseText = JSON.stringify(status === 200 ? { name, family: "image", size: 3, cancellationToken: `cancel-${name}` } : { error: "Refusé" });
    this.onload?.();
  }
}
const file = () => new File(["abc"], "photo.png");
beforeEach(() => {
  vi.clearAllMocks();
  discard.mockResolvedValue(undefined);
  UploadRequest.requests = [];
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
});
async function uploaded(session: ReturnType<typeof createUploadSession>, name = "photo.png") {
  const pending = session.upload(file(), () => {});
  UploadRequest.requests.at(-1)!.finish(name);
  return pending;
}

describe("upload lifecycle", () => {
  it("cancels only the file created by this interaction, once", async () => {
    const session = createUploadSession();
    await uploaded(session, "photo-2.png");
    expect(await session.cancel()).toBe(true);
    expect(await session.cancel()).toBe(false);
    expect(discard).toHaveBeenCalledExactlyOnceWith("photo-2.png", "cancel-photo-2.png");
  });
  it("keeps accepted uploads and never deletes on editing or menu insertion", async () => {
    const session = createUploadSession();
    expect(await session.cancel()).toBe(false);
    await uploaded(session);
    session.accept();
    expect(await session.cancel()).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    await uploaded(session, "second.png");
    await session.cancel();
    expect(discard).toHaveBeenCalledExactlyOnceWith("second.png", "cancel-second.png");
  });
  it("does not lose an upload to a second concurrent or unfinished insertion", async () => {
    const session = createUploadSession();
    const pending = session.upload(file(), () => {});
    await expect(session.upload(file(), () => {})).rejects.toThrow();
    UploadRequest.requests[0].finish("first.png");
    await pending;
    await expect(session.upload(file(), () => {})).rejects.toThrow();
    await session.cancel();
    expect(discard).toHaveBeenCalledExactlyOnceWith("first.png", "cancel-first.png");
  });
  it("allows retry after a failed transfer without deleting another file", async () => {
    const session = createUploadSession();
    const pending = session.upload(file(), () => {});
    UploadRequest.requests[0].finish("", 403);
    await expect(pending).rejects.toThrow("Refusé");
    expect(await session.cancel()).toBe(false);
    await uploaded(session);
    session.accept();
    expect(discard).not.toHaveBeenCalled();
  });
  it("reports deletion failures to the caller", async () => {
    const session = createUploadSession();
    await uploaded(session);
    discard.mockRejectedValue(new Error("disk error"));
    await expect(session.cancel()).rejects.toThrow("disk error");
    discard.mockResolvedValue(undefined);
    expect(await session.cancel()).toBe(true);
    expect(discard).toHaveBeenCalledTimes(2);
  });
  it("transmits progress and retains the immediate-upload interface for entry fields", async () => {
    const progress = vi.fn();
    const pending = uploadFile(file(), progress);
    const request = UploadRequest.requests[0];
    expect(request.open).toHaveBeenCalledWith("POST", "/api/files");
    request.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
    expect(progress).toHaveBeenCalledWith(0.5);
    request.finish("photo.png");
    expect(await pending).toEqual({
      name: "photo.png",
      family: "image",
      size: 3,
      cancellationToken: "cancel-photo.png",
    });
    expect(discard).not.toHaveBeenCalled();
  });
});
