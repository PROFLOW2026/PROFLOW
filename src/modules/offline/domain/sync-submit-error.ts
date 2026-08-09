export class OfflineSyncSubmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineSyncSubmitError';
  }
}
