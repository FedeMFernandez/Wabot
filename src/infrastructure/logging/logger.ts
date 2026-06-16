function isDebugEnabled(): boolean {
  return process.env.DEBUG_MODE === 'true';
}

export function logDebug(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(...args);
  }
}

export function logInfo(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.info(...args);
  }
}

export function logWarn(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
}

export function logError(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.error(...args);
  }
}

export function logAlways(...args: unknown[]): void {
  console.log(...args);
}

export function logFatal(...args: unknown[]): void {
  console.error(...args);
}
