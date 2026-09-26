'use client';

interface HistoryPoint {
  date: string;
  score: number;
}

interface PressureHistoryChartProps {
  data: HistoryPoint[];
  ariaLabel: string;
}

export function PressureHistoryChart({ data, ariaLabel }: PressureHistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        —
      </div>
    );
  }

  const width = 640;
  const height = 200;
  const padX = 32;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const scores = data.map((d) => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const range = maxScore - minScore || 1;

  const points = data.map((d, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = padY + innerH - ((d.score - minScore) / range) * innerH;
    return `${x},${y}`;
  });

  const neutralY = padY + innerH - ((50 - minScore) / range) * innerH;

  return (
    <figure className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full min-w-[280px]"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={padX}
          y1={neutralY}
          x2={width - padX}
          y2={neutralY}
          className="stroke-border"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <polyline
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          points={points.join(' ')}
        />
        {data.map((d, i) => {
          const x = padX + (i / Math.max(data.length - 1, 1)) * innerW;
          const y = padY + innerH - ((d.score - minScore) / range) * innerH;
          return <circle key={d.date} cx={x} cy={y} r={3} className="fill-primary" />;
        })}
      </svg>
    </figure>
  );
}
