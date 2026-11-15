import { describe, expect, it } from "vitest";
import { readDemoLibraryFile } from "@/modules/demo/application/library-read";

describe("demo library read", () => {
  it("refuses a token that can write", async () => {
    await expect(
      readDemoLibraryFile(
        {
          scopes: ["https://www.googleapis.com/auth/drive"],
          async listRootFileIds() {
            return ["a"];
          },
          async download() {
            return { bytes: new Uint8Array([1]), contentType: "application/pdf" };
          },
        },
        "a",
      ),
    ).rejects.toThrow(/write/);
  });

  it("downloads only a file inside the configured root", async () => {
    const result = await readDemoLibraryFile(
      {
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        async listRootFileIds() {
          return ["allowed"];
        },
        async download(fileId) {
          return { bytes: new Uint8Array([fileId.length]), contentType: "application/pdf" };
        },
      },
      "allowed",
    );
    expect(result?.bytes).toEqual(new Uint8Array([7]));
    const blocked = await readDemoLibraryFile(
      {
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        async listRootFileIds() {
          return ["allowed"];
        },
        async download() {
          throw new Error("should not download");
        },
      },
      "other",
    );
    expect(blocked).toBeNull();
  });
});
