/// <reference lib="webworker" />
import { inflateZip } from '../domain/inflate-zip';

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  void inflateZip(new Uint8Array(event.data))
    .then((files) => {
      const transfer = files.map((file) => file.bytes.buffer);
      self.postMessage({ ok: true, files }, transfer);
    })
    .catch((error: unknown) => {
      self.postMessage({ ok: false, message: error instanceof Error ? error.message : 'zip_failed' });
    });
};
