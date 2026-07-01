/**
 * Read a File/Blob into a Node.js Buffer without touching SharedArrayBuffer.
 *
 * file.arrayBuffer() in the Next.js/Vercel runtime returns an ArrayBuffer whose
 * backing store is (or appears to sharp as) a SharedArrayBuffer — sharp rejects
 * it with "SharedArrayBuffer is not allowed." Reading via the WHATWG stream API
 * yields fresh Uint8Array chunks from the decoder with no shared backing.
 */
export async function fileToBuffer(file: File | Blob): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // value is a decoder-allocated Uint8Array — copy into a dedicated Buffer
      const chunk = Buffer.allocUnsafeSlow(value.byteLength);
      chunk.set(value);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
