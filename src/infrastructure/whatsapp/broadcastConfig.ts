function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export interface BroadcastConfig {
  minDelayMs: number;
  maxDelayMs: number;
  groupMinDelayMs: number;
  groupMaxDelayMs: number;
  batchSize: number;
  batchPauseMs: number;
  simulateTyping: boolean;
  typingMinMs: number;
  typingMaxMs: number;
}

export function loadBroadcastConfig(): BroadcastConfig {
  return {
    minDelayMs: readInt('BROADCAST_MIN_DELAY_MS', 8000),
    maxDelayMs: readInt('BROADCAST_MAX_DELAY_MS', 25000),
    groupMinDelayMs: readInt('BROADCAST_GROUP_MIN_DELAY_MS', 15000),
    groupMaxDelayMs: readInt('BROADCAST_GROUP_MAX_DELAY_MS', 40000),
    batchSize: readInt('BROADCAST_BATCH_SIZE', 25),
    batchPauseMs: readInt('BROADCAST_BATCH_PAUSE_MS', 300000),
    simulateTyping: readBool('BROADCAST_SIMULATE_TYPING', true),
    typingMinMs: readInt('BROADCAST_TYPING_MIN_MS', 1000),
    typingMaxMs: readInt('BROADCAST_TYPING_MAX_MS', 3000),
  };
}
