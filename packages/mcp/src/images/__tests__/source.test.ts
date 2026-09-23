import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FetchLike } from "../../client/http.js";
import {
  ImageSourceError,
  MAX_IMAGE_BYTES,
  fetchImageUrl,
  isInsideRoot,
  readLocalImage,
  sniffImageType,
} from "../source.js";
import { JPEG, PNG } from "./fixtures.js";

let tmp: string;
let root: string;
let outside: string;

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cityroam-mcp-src-")));
  root = path.join(tmp, "root");
  outside = path.join(tmp, "outside");
  await fs.mkdir(path.join(root, "sub"), { recursive: true });
  await fs.mkdir(outside);
  await fs.writeFile(path.join(root, "sub", "photo.jpg"), JPEG);
  await fs.writeFile(path.join(outside, "secret.jpg"), JPEG);
  await fs.writeFile(path.join(tmp, "root-sibling.jpg"), JPEG);
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("sniffImageType", () => {
  it("recognises JPEG and PNG magic bytes only", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("isInsideRoot", () => {
  it("accepts descendants and rejects the root itself, parents, siblings and prefix look-alikes", () => {
    const r = path.join(tmp, "root");
    expect(isInsideRoot(r, path.join(r, "a.jpg"))).toBe(true);
    expect(isInsideRoot(r, path.join(r, "sub", "a.jpg"))).toBe(true);
    expect(isInsideRoot(r, path.join(r, "..a.jpg"))).toBe(true);
    expect(isInsideRoot(r, r)).toBe(false);
    expect(isInsideRoot(r, tmp)).toBe(false);
    expect(isInsideRoot(r, path.join(tmp, "root-sibling.jpg"))).toBe(false);
    expect(isInsideRoot(r, path.join(tmp, "outside", "secret.jpg"))).toBe(false);
  });
});

describe("readLocalImage", () => {
  it("reads a file inside a root", async () => {
    const img = await readLocalImage(path.join(root, "sub", "photo.jpg"), [root]);
    expect(Array.from(img.bytes)).toEqual(Array.from(JPEG));
    expect(img.filename).toBe("photo.jpg");
  });

  it("refuses path uploads when no roots are configured, with guidance", async () => {
    await expect(readLocalImage(path.join(root, "sub", "photo.jpg"), [])).rejects.toThrow(/CITYROAM_IMAGE_ROOTS/);
  });

  it("rejects relative paths", async () => {
    await expect(readLocalImage("sub/photo.jpg", [root])).rejects.toThrow(/absolute/);
  });

  it("rejects .. traversal out of the root", async () => {
    const sneaky = `${root}${path.sep}sub${path.sep}..${path.sep}..${path.sep}outside${path.sep}secret.jpg`;
    await expect(readLocalImage(sneaky, [root])).rejects.toThrow(/outside the allowed image folders/);
    await expect(readLocalImage(path.join(tmp, "root-sibling.jpg"), [root])).rejects.toThrow(/outside/);
  });

  it("rejects a directory junction/symlink that escapes the root", async () => {
    const link = path.join(root, "escape-dir");
    // "junction" needs no privileges on Windows; elsewhere the type is ignored and a dir symlink is made.
    await fs.symlink(outside, link, "junction");
    await expect(readLocalImage(path.join(link, "secret.jpg"), [root])).rejects.toThrow(/outside the allowed image folders/);
  });

  it("rejects a file symlink that escapes the root", async (ctx) => {
    const link = path.join(root, "escape.jpg");
    try {
      await fs.symlink(path.join(outside, "secret.jpg"), link, "file");
    } catch (err) {
      // Windows without Developer Mode/admin cannot create file symlinks (EPERM).
      ctx.skip(`file symlinks not permitted here: ${(err as NodeJS.ErrnoException).code}`);
      return;
    }
    await expect(readLocalImage(link, [root])).rejects.toThrow(/outside the allowed image folders/);
  });

  it("rejects missing files, directories and files over 5 MB", async () => {
    await expect(readLocalImage(path.join(root, "nope.jpg"), [root])).rejects.toThrow(/No such file/);
    await expect(readLocalImage(path.join(root, "sub"), [root])).rejects.toThrow(/not a regular file/);
    const big = path.join(root, "big.jpg");
    const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
    bytes.set(JPEG);
    await fs.writeFile(big, bytes);
    await expect(readLocalImage(big, [root])).rejects.toThrow(/5 MB/);
  });
});

function streamOf(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("fetchImageUrl", () => {
  const ok = (body: BodyInit | null, headers: Record<string, string>): FetchLike => async () =>
    new Response(body, { status: 200, headers });

  it("rejects non-http(s) schemes before fetching", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return new Response(JPEG);
    };
    for (const url of ["file:///etc/passwd", "ftp://example.com/a.jpg", "data:image/jpeg;base64,/9j/", "not a url"]) {
      await expect(fetchImageUrl(url, fetchImpl)).rejects.toBeInstanceOf(ImageSourceError);
    }
    expect(called).toBe(false);
  });

  it("downloads a JPEG and names it from the URL path", async () => {
    const img = await fetchImageUrl("https://example.com/photos/town%20hall.jpg?sig=abc", ok(JPEG, { "Content-Type": "image/jpeg" }));
    expect(Array.from(img.bytes)).toEqual(Array.from(JPEG));
    expect(img.filename).toBe("town hall.jpg");
    expect(img.origin).toBe("https://example.com/photos/town%20hall.jpg");
  });

  it("requires an image/jpeg or image/png content type", async () => {
    await expect(
      fetchImageUrl("https://example.com/page", ok("<html></html>", { "Content-Type": "text/html; charset=utf-8" })),
    ).rejects.toThrow(/Content-Type "text\/html"/);
    const png = await fetchImageUrl("https://example.com/a.png", ok(PNG, { "Content-Type": "image/png; foo=bar" }));
    expect(png.bytes.length).toBe(PNG.length);
  });

  it("rejects a declared Content-Length over 5 MB without reading the body", async () => {
    let cancelled = false;
    const fetchImpl = ok(streamOf([JPEG], () => (cancelled = true)), {
      "Content-Type": "image/jpeg",
      "Content-Length": String(MAX_IMAGE_BYTES + 1),
    });
    await expect(fetchImageUrl("https://example.com/big.jpg", fetchImpl)).rejects.toThrow(/5 MB/);
    expect(cancelled).toBe(true);
  });

  it("stops streaming once the body passes 5 MB (no Content-Length)", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    const chunks = Array.from({ length: 10 }, () => chunk);
    const fetchImpl = ok(streamOf(chunks, () => (cancelled = true)), { "Content-Type": "image/jpeg" });
    await expect(fetchImageUrl("https://example.com/big.jpg", fetchImpl)).rejects.toThrow(/5 MB/);
    expect(cancelled).toBe(true);
  });

  it("times out", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    await expect(fetchImageUrl("https://example.com/slow.jpg", hang, { timeoutMs: 20 })).rejects.toThrow(/timed out/);
  });

  it("reports HTTP errors", async () => {
    const notFound: FetchLike = async () => new Response("nope", { status: 404 });
    await expect(fetchImageUrl("https://example.com/missing.jpg", notFound)).rejects.toThrow(/HTTP 404/);
  });
});
