let currentQr: string | null = null;

export function setCurrentQr(qr: string | null): void {
  currentQr = qr;
}

export function getCurrentQr(): string | null {
  return currentQr;
}
