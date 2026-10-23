export interface MultipartPart {
  contentType: string;
  content: Uint8Array<ArrayBuffer>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CRLF = encoder.encode('\r\n');
const HEADERS_END = encoder.encode('\r\n\r\n');
const ARCHIVE_TYPE = 'application/gzip';

const indexOfBytes = (
  haystack: Uint8Array,
  needle: Uint8Array,
  from: number,
): number => {
  const last = haystack.length - needle.length;
  for (let i = Math.max(from, 0); i <= last; i += 1) {
    let j = 0;
    while (j < needle.length && haystack[i + j] === needle[j]) j += 1;
    if (j === needle.length) return i;
  }
  return -1;
};

export const multipartBoundary = (
  contentType: string | null,
): string | undefined => {
  if (!contentType?.toLowerCase().startsWith('multipart/')) return undefined;
  return /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
};

const partContentType = (headers: string): string =>
  headers
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith('content-type:'))
    ?.slice('content-type:'.length)
    .split(';')[0]
    .trim()
    .toLowerCase() ?? '';

// The daemon writes nothing after the final part, so its content runs to the
// closing boundary. Undefined when the closing boundary is missing: the body was cut short.
export const finalPart = (
  body: Uint8Array<ArrayBuffer>,
  boundary: string,
): MultipartPart | undefined => {
  const delimiter = encoder.encode(`--${boundary}`);
  const nextDelimiter = encoder.encode(`\r\n--${boundary}`);
  const closing = encoder.encode(`\r\n--${boundary}--`);

  let end = body.length;
  while (end > 0 && (body[end - 1] === 0x0a || body[end - 1] === 0x0d)) {
    end -= 1;
  }
  const closingIndex = end - closing.length;
  if (closingIndex < 0 || indexOfBytes(body, closing, closingIndex) === -1) {
    return undefined;
  }

  let cursor = indexOfBytes(body, delimiter, 0);
  while (cursor !== -1 && cursor < closingIndex) {
    const afterDelimiter = cursor + delimiter.length;
    const headersEnd = indexOfBytes(body, HEADERS_END, afterDelimiter);
    if (headersEnd === -1) return undefined;
    const contentType = partContentType(
      decoder.decode(body.subarray(afterDelimiter + CRLF.length, headersEnd)),
    );
    const contentStart = headersEnd + HEADERS_END.length;
    // The archive is always the last part: searching it for a delimiter reads every byte.
    const next =
      contentType === ARCHIVE_TYPE
        ? closingIndex
        : indexOfBytes(body, nextDelimiter, contentStart);
    if (next === closingIndex) {
      return {
        contentType,
        content: body.subarray(contentStart, closingIndex),
      };
    }
    cursor = next === -1 ? -1 : next + CRLF.length;
  }
  return undefined;
};
