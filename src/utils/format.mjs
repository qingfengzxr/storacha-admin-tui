const normalizeBytes = (value) => {
  if (value == null) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.floor(value));
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

const formatBytes = (bytes) => {
  const n = normalizeBytes(bytes);
  if (n == null) return '--';
  if (n === 0n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = n;
  let unitIndex = 0;
  while (size >= 1024n && unitIndex < units.length - 1) {
    size /= 1024n;
    unitIndex++;
  }
  if (unitIndex === 0) return `${size} B`;
  const denom = 1024n ** BigInt(unitIndex);
  const scaled = (n * 100n) / denom;
  const integer = scaled / 100n;
  const frac = (scaled % 100n).toString().padStart(2, '0');
  return `${integer}.${frac} ${units[unitIndex]}`;
};

const toTimestampMs = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const formatTime = (value) => {
  const ts = toTimestampMs(value);
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
};

const pickTimestamp = (obj) =>
  obj?.createdAt ??
  obj?.created ??
  obj?.insertedAt ??
  obj?.updatedAt ??
  obj?.uploadedAt ??
  obj?.timestamp ??
  obj?.ts;

const sumShardSizes = (shards) => {
  if (!Array.isArray(shards)) return null;
  let total = 0n;
  let hasSize = false;
  for (const shard of shards) {
    const raw = shard?.size ?? shard?.blob?.size ?? shard?.digest?.size;
    if (raw == null) continue;
    try {
      total += typeof raw === 'bigint' ? raw : BigInt(raw);
      hasSize = true;
    } catch {
      // ignore
    }
  }
  return hasSize ? total : null;
};

const padEnd = (value, width) => String(value ?? '').padEnd(width, ' ');
const padStart = (value, width) => String(value ?? '').padStart(width, ' ');

const parseNumberInput = (value, fallback, min, max) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.max(min, Math.min(max, Math.floor(parsed)));
  return bounded;
};

export {
  normalizeBytes,
  formatBytes,
  toTimestampMs,
  formatTime,
  pickTimestamp,
  sumShardSizes,
  padEnd,
  padStart,
  parseNumberInput
};
