import { CID, base58btc, decodeDigest } from '../config/multiformats.mjs';

const parseBlobId = (value) => {
  const v = value.trim();
  try {
    const cid = CID.parse(v);
    return cid.multihash;
  } catch {
    // ignore
  }
  const bytes = base58btc.decode(v);
  return decodeDigest(bytes);
};

const normalizeDigest = (input) => {
  if (!input) throw new Error('Missing digest');
  if (typeof input === 'object' && input.bytes instanceof Uint8Array) return input;
  if (input instanceof Uint8Array) return decodeDigest(input);
  if (typeof input === 'string') return parseBlobId(input);
  const maybe = input?.['/'] ?? input?.digest ?? input?.multihash;
  if (typeof maybe === 'string') return parseBlobId(maybe);
  throw new Error(`Unsupported digest type: ${typeof input}`);
};

const digestToString = (digest) => {
  if (!digest) return '(unknown)';
  if (typeof digest === 'string') return digest;
  if (typeof digest === 'object' && digest.bytes instanceof Uint8Array) {
    return base58btc.encode(digest.bytes);
  }
  try {
    return base58btc.encode(normalizeDigest(digest).bytes);
  } catch {
    return '(invalid digest)';
  }
};

const blobInfoCache = new Map();

const fetchBlobInfo = async (client, digest) => {
  if (!client?.capability?.blob || !digest) return null;
  const digestKey = digestToString(digest);
  if (blobInfoCache.has(digestKey)) {
    return blobInfoCache.get(digestKey);
  }
  let result = null;
  if (typeof client.capability.blob.get === 'function') {
    try {
      const out = await client.capability.blob.get(digest);
      if (out?.ok) {
        result = out.ok;
      }
    } catch {
      // ignore
    }
  }
  if (!result && typeof client.capability.blob.list === 'function') {
    let cursor;
    for (let i = 0; i < 5; i += 1) {
      try {
        const out = await client.capability.blob.list({ size: 200, cursor });
        const entries = out?.results ?? [];
        const match = entries.find((entry) => {
          const entryDigest = entry?.blob?.digest ?? entry?.digest;
          return digestToString(entryDigest) === digestKey;
        });
        if (match) {
          result = match?.blob ?? match;
          break;
        }
        cursor = out?.cursor;
        if (!cursor) break;
      } catch {
        break;
      }
    }
  }
  blobInfoCache.set(digestKey, result);
  return result;
};

export { parseBlobId, normalizeDigest, digestToString, fetchBlobInfo };
