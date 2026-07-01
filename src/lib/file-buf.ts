/**
 * Copy any Buffer/typed array into a Uint8Array backed by a fresh, NON-shared
 * ArrayBuffer.
 *
 * On Vercel's Linux runtime, sharp/libvips returns output buffers backed by a
 * SharedArrayBuffer (its memory pool). When such a buffer is handed to fetch()
 * as a body — which is what Vercel Blob's put() does under the hood — undici's
 * webidl BufferSource conversion runs with allowShared:false and throws
 * "SharedArrayBuffer is not allowed." `Buffer.allocUnsafeSlow(n)` always gives a
 * Buffer with its own dedicated plain ArrayBuffer, so set()-copying into it
 * strips the shared backing. (undici only rejects a genuine SharedArrayBuffer,
 * not Node's normal pool.) macOS sharp allocates plain buffers, so this never
 * reproduces locally.
 */
export function toUnsharedBuffer(buf: Uint8Array): Buffer {
  const fresh = Buffer.allocUnsafeSlow(buf.byteLength);
  fresh.set(buf);
  return fresh;
}

/**
 * Read a File/Blob into a Node.js Buffer without touching SharedArrayBuffer.
 *
 * file.arrayBuffer() in the Next.js/Vercel runtime can return an ArrayBuffer
 * whose backing store is a SharedArrayBuffer. Reading via the WHATWG stream API
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
