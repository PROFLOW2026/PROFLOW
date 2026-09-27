import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
interface TradePendingPanelProps {
  tradeLabel: string;
  pendingTitle: string;
  pendingDescription: string;
}

export function TradePendingPanel({
  tradeLabel,
  pendingTitle,
  pendingDescription,
}: TradePendingPanelProps) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>{tradeLabel}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="font-medium text-muted-foreground">{pendingTitle}</p>
        <p className="text-muted-foreground">{pendingDescription}</p>
      </CardContent>
    </Card>
  );
}
