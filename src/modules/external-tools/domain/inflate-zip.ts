import { Unzip, UnzipInflate } from 'fflate';
import { extensionOf, isDrawingName, LOCAL_FILE_LIMIT, LOCAL_TOTAL_LIMIT } from './local-files';
import { ZIP_RATIO_LIMIT, zipEntryAllowed } from './zip-policy';

export interface InflatedZipFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Streaming inflate. Counts the bytes that were actually produced, not the header size. */
export function inflateZip(input: Uint8Array): Promise<InflatedZipFile[]> {
  return new Promise((resolve, reject) => {
    const files: InflatedZipFile[] = [];
    let produced = 0;
    let compressed = 0;
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      if (!zipEntryAllowed(file.name) || !isDrawingName(file.name) || extensionOf(file.name) === '') {
        file.terminate();
        return;
      }
      const chunks: Uint8Array[] = [];
      file.ondata = (error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }
        if (chunk) {
          chunks.push(chunk);
          produced += chunk.byteLength;
          if (produced > LOCAL_TOTAL_LIMIT || files.length > LOCAL_FILE_LIMIT) {
            reject(new Error('zip_cap'));
            return;
          }
        }
        if (final) {
          const size = chunks.reduce((sum, part) => sum + part.byteLength, 0);
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            bytes.set(part, offset);
            offset += part.byteLength;
          }
          files.push({ name: file.name, bytes });
        }
      };
      file.start();
    };
    compressed = input.byteLength;
    unzip.push(input, true);
    if (compressed > 0 && produced / compressed > ZIP_RATIO_LIMIT) {
      reject(new Error('zip_ratio'));
      return;
    }
    resolve(files);
  });
}
