import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadDocumentBytes } from "@/modules/documents/client/upload-document-bytes";

afterEach(() => {
  delete document.documentElement.dataset.exlfyDemo;
  vi.unstubAllGlobals();
});

describe("demo local upload", () => {
  it("stores the file in the browser and does not call the server", async () => {
    const saved: unknown[] = [];
    vi.stubGlobal("indexedDB", {
      open() {
        const request = {
          result: {
            createObjectStore() {},
            transaction() {
              return {
                objectStore() {
                  return {
                    put(value: unknown) {
                      saved.push(value);
                      const write = { onsuccess: null as null | (() => void), onerror: null };
                      queueMicrotask(() => write.onsuccess?.());
                      return write;
                    },
                  };
                },
              };
            },
          },
          onsuccess: null as null | (() => void),
          onerror: null,
          onupgradeneeded: null as null | (() => void),
        };
        queueMicrotask(() => {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    document.documentElement.dataset.exlfyDemo = "session";
    const result = await uploadDocumentBytes(
      { uploadUrl: "https://example.invalid/upload" },
      new Blob(["demo"]),
    );
    expect(result).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
