// A markdown image, `![alt](path)`. The path is the only part rewritten.
const MARKDOWN_IMAGE = /!\[(.*?)\]\((.*?)\)/g;

// The `src` of a raw `<img>` tag, which authored READMEs reach for when they
// need a size (`<img src="icon.svg" width="24">`), with the quote it was
// written with so the rewrite can close it the same way.
const HTML_IMG_SRC = /(<img\b[^>]*?\ssrc=)(["'])(.*?)\2/gi;

// A path that already names where to load from: a URL with a scheme
// (`https:`, `data:`, `blob:`) or a protocol-relative one. Everything else is
// relative to the document and needs the asset route.
function isRelativeAsset(path: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path);
}

/**
 * Rewrite the relative image paths of a markdown document through `mapper`,
 * so a document that ships next to its assets can be rendered from anywhere.
 * Covers both markdown images and raw `<img>` tags; a path that already has a
 * scheme is left alone.
 */
export function mapAssetSources(
  content: string | undefined,
  mapper: (path: string) => string,
  rootPath = '',
): string {
  if (content === undefined) return '';

  const resolve = (path: string): string => {
    if (!isRelativeAsset(path)) return path;
    return mapper(rootPath ? `${rootPath}/${path}` : path);
  };

  return content
    .replace(MARKDOWN_IMAGE, (_, alt, path) => `![${alt}](${resolve(path)})`)
    .replace(
      HTML_IMG_SRC,
      (_, before, quote, path) => `${before}${quote}${resolve(path)}${quote}`,
    );
}
