/**
 * A minimal ZIP reader, for importing a folder of photos as one file.
 *
 * WHY NOT A LIBRARY
 *
 * The app already writes ZIPs with client-zip, which is write-only. Adding a
 * second archive dependency to read one back is a lot of bytes for a job the
 * platform can now do on its own: `DecompressionStream("deflate-raw")` handles
 * the only compression method that matters, and the container format is a
 * couple of dozen lines of DataView reads.
 *
 * WHAT IT SUPPORTS
 *
 * Stored (method 0) and deflated (method 8) entries, which is everything the
 * Finder, Windows Explorer, `zip` and 7-Zip produce for a folder of JPEGs.
 * Directory entries and anything a Mac adds under `__MACOSX/` are skipped.
 * ZIP64 is not supported and says so; a photo archive that needs it would be
 * over four gigabytes.
 *
 * Entries are read lazily. `entries()` only parses the central directory, and
 * each file's bytes are pulled from the Blob when asked for, so a 500-photo
 * archive is never held in memory all at once.
 */

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
/** The comment field is 16 bits, so the record cannot start further back. */
const EOCD_MAX_SCAN = 0xffff + EOCD_MIN_SIZE;

export interface ZipEntry {
  /** Path as stored, including any folders. */
  name: string;
  /** Just the file name, which is what photo matching works on. */
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  /** Reads and, if needed, inflates this entry. */
  read(): Promise<Blob>;
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Inflates a raw deflate stream. Chrome 103, Firefox 113, Safari 16.4. */
async function inflateRaw(data: Blob): Promise<Blob> {
  const Decompressor = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!Decompressor) {
    throw new Error("This browser cannot read compressed zip entries.");
  }
  const stream = data.stream().pipeThrough(new Decompressor("deflate-raw"));
  return new Response(stream).blob();
}

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  if (file.size < EOCD_MIN_SIZE) throw new Error("That file is too small to be a zip.");

  // The end-of-central-directory record is last, but a trailing comment can
  // push it back, so scan for the signature from the end.
  const tailSize = Math.min(file.size, EOCD_MAX_SCAN);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());

  let eocd = -1;
  for (let offset = tail.byteLength - EOCD_MIN_SIZE; offset >= 0; offset--) {
    if (tail.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error("That does not look like a zip file.");

  const count = tail.getUint16(eocd + 10, true);
  const directorySize = tail.getUint32(eocd + 12, true);
  const directoryOffset = tail.getUint32(eocd + 16, true);

  if (directoryOffset === 0xffffffff || count === 0xffff) {
    throw new Error("ZIP64 archives are not supported. Split the photos into smaller zips.");
  }

  const directory = new DataView(
    await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer(),
  );
  const directoryBytes = new Uint8Array(directory.buffer);

  const entries: ZipEntry[] = [];
  let cursor = 0;

  for (let i = 0; i < count && cursor + 46 <= directory.byteLength; i++) {
    if (directory.getUint32(cursor, true) !== 0x02014b50) break;

    const method = directory.getUint16(cursor + 10, true);
    const compressedSize = directory.getUint32(cursor + 20, true);
    const uncompressedSize = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    const localOffset = directory.getUint32(cursor + 42, true);
    const name = utf8(directoryBytes.subarray(cursor + 46, cursor + 46 + nameLength));

    cursor += 46 + nameLength + extraLength + commentLength;

    // Folders, and the resource-fork sidecars a Mac adds.
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || name.split("/").pop()?.startsWith("._")) {
      continue;
    }
    if (method !== 0 && method !== 8) continue;

    entries.push({
      name,
      fileName: name.split("/").pop() ?? name,
      compressedSize,
      uncompressedSize,
      async read() {
        // The local header repeats the name and extra fields, and its extra
        // field length can differ from the central one, so the data offset has
        // to be read from the local header rather than assumed.
        const header = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
        if (header.getUint32(0, true) !== 0x04034b50) {
          throw new Error(`Corrupt entry: ${name}`);
        }
        const localNameLength = header.getUint16(26, true);
        const localExtraLength = header.getUint16(28, true);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const raw = file.slice(start, start + compressedSize);
        return method === 8 ? inflateRaw(raw) : raw;
      },
    });
  }

  return entries;
}
