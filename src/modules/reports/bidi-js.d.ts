declare module 'bidi-js' {
  interface BidiEmbeddingLevels {
    readonly levels: Uint8Array;
  }

  interface BidiEngine {
    getEmbeddingLevels(
      text: string,
      explicitDirection?: 'ltr' | 'rtl' | null,
    ): BidiEmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: BidiEmbeddingLevels,
    ): Array<[number, number]>;
  }

  export default function bidiFactory(): BidiEngine;
}
