/**
 * Normal vs Plot text-key parity for CAD WASM scene JSON.
 * Shared by the CI unit test and the local audit script.
 */

export type CadParityText = {
  readonly x: number;
  readonly y: number;
  readonly layer: string;
  readonly t: string;
  readonly c?: number;
  readonly gpu?: boolean;
};

export type CadParityScene = {
  readonly texts: readonly CadParityText[];
};

export type CadTextParityResult = {
  readonly textTotalNormal: number;
  readonly textTotalPlot: number;
  readonly onlyNormal: number;
  readonly onlyPlot: number;
  readonly gpuMarkedNormal: number;
};

export function cadTextKey(text: CadParityText): string {
  return `${text.x.toFixed(3)}|${text.y.toFixed(3)}|${text.layer}|${text.t.slice(0, 40)}`;
}

export function compareNormalPlotTextParity(
  normal: CadParityScene,
  plot: CadParityScene,
): CadTextParityResult {
  const normalMap = new Map(normal.texts.map((text) => [cadTextKey(text), text]));
  const plotMap = new Map(plot.texts.map((text) => [cadTextKey(text), text]));

  let onlyNormal = 0;
  let onlyPlot = 0;
  for (const key of normalMap.keys()) {
    if (!plotMap.has(key)) onlyNormal += 1;
  }
  for (const key of plotMap.keys()) {
    if (!normalMap.has(key)) onlyPlot += 1;
  }

  return {
    textTotalNormal: normal.texts.length,
    textTotalPlot: plot.texts.length,
    onlyNormal,
    onlyPlot,
    gpuMarkedNormal: normal.texts.filter((text) => text.gpu).length,
  };
}
