import {
  divideMoney,
  fromNumericString,
  isZeroMoney,
  multiplyMoney,
  roundMoney,
  type MoneyValue,
} from '@/shared/money';

export interface InstallmentRecognitionSnapshot {
  readonly hasActiveLines: boolean;
  readonly recognizedAmount: string;
}

/**
 * Project Actual (all-time) contribution for one expense line when parent is on installments.
 * OD-03: zero verified payments → 0, not full NET.
 */
export function projectInstallmentContributionAmount(input: {
  readonly fullAmount: string;
  readonly currency: string;
  readonly installmentCount: number;
  readonly parentNet: string;
  readonly recognition: InstallmentRecognitionSnapshot | undefined;
}): string {
  const { fullAmount, currency, installmentCount, parentNet, recognition } = input;
  if (installmentCount <= 1) return fullAmount;
  if (!recognition?.hasActiveLines) return '0';

  const recognized = fromNumericString(recognition.recognizedAmount, currency);
  const net = fromNumericString(parentNet, currency);
  const line = fromNumericString(fullAmount, currency);
  if (!recognized || !net || !line) return '0';
  if (isZeroMoney(net)) return '0';
  if (net.amount === recognized.amount) return fullAmount;
  return roundMoney(divideMoney(multiplyMoney(line, recognized.amount), net.amount)).amount;
}

/** Build recognition map entry for installment expense (including zero recognized). */
export function installmentRecognitionEntry(recognized: MoneyValue): InstallmentRecognitionSnapshot {
  return { hasActiveLines: true, recognizedAmount: recognized.amount };
}
