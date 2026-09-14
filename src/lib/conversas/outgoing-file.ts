export const MAX_OUTGOING_FILE_BYTES = 20 * 1024 * 1024;

const TYPES = new Map<string, 'image' | 'video' | 'document'>([
  ['image/jpeg', 'image'], ['image/png', 'image'], ['image/gif', 'image'], ['image/webp', 'image'],
  ['video/mp4', 'video'], ['video/quicktime', 'video'], ['video/webm', 'video'],
  ['application/pdf', 'document'], ['application/msword', 'document'], ['application/vnd.ms-excel', 'document'],
  ['application/vnd.ms-powerpoint', 'document'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'document'],
]);

function safeName(value: string) {
  return (value.split(/[\\/]/).pop() ?? 'arquivo').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 128) || 'arquivo';
}

function has(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function validSignature(mime: string, bytes: Uint8Array) {
  if (mime === 'application/pdf') return has(bytes, [0x25,0x50,0x44,0x46,0x2d]);
  if (mime === 'image/png') return has(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if (mime === 'image/jpeg') return has(bytes, [0xff,0xd8,0xff]);
  if (mime === 'image/gif') return new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/) !== null;
  if (mime === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (mime === 'video/mp4' || mime === 'video/quicktime') return new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';
  if (mime === 'video/webm') return has(bytes, [0x1a,0x45,0xdf,0xa3]);
  if (mime.includes('openxmlformats')) return has(bytes, [0x50,0x4b,0x03,0x04]);
  return has(bytes, [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
}

export async function validateOutgoingFile(file: File) {
  const mimeType = file.type.toLowerCase().split(';')[0];
  const tipo = TYPES.get(mimeType);
  if (!tipo || file.size === 0 || file.size > MAX_OUTGOING_FILE_BYTES) return null;
  const head = file.slice(0, 16);
  const buffer = typeof head.arrayBuffer === 'function'
    ? await head.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(head);
      });
  const bytes = new Uint8Array(buffer);
  if (!validSignature(mimeType, bytes)) return null;
  return { tipo, mimeType, fileName: safeName(file.name) } as const;
}
