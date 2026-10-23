import { describe, expect, it } from 'vitest';

import { mapAssetSources } from './utils';

const toAssetRoute = (path: string): string => '/file-content-assets/' + path;
const APP = '/home/arduino/ArduinoApps/my-app';

describe('mapAssetSources', () => {
  it('returns an empty string for a missing document', () => {
    expect(mapAssetSources(undefined, toAssetRoute, APP)).toBe('');
  });

  it('rewrites a markdown image under the app path', () => {
    expect(
      mapAssetSources('![Setup](assets/setup.png)', toAssetRoute, APP),
    ).toBe(`![Setup](/file-content-assets/${APP}/assets/setup.png)`);
  });

  it('rewrites the src of a raw img tag and keeps its other attributes', () => {
    const content =
      '- **Open Palm** <img src="assets/img/open_palm.svg" alt="Open Palm" width="24">';

    expect(mapAssetSources(content, toAssetRoute, APP)).toBe(
      `- **Open Palm** <img src="/file-content-assets/${APP}/assets/img/open_palm.svg" alt="Open Palm" width="24">`,
    );
  });

  it('rewrites a src written with single quotes or after other attributes', () => {
    const content = `<img alt='Logo' src='img/logo.svg' />`;

    expect(mapAssetSources(content, toAssetRoute, APP)).toBe(
      `<img alt='Logo' src='/file-content-assets/${APP}/img/logo.svg' />`,
    );
  });

  it('rewrites every image of the document', () => {
    const content = [
      '![A](a.png)',
      '<img src="b.svg" width="24"> <img src="c.svg" width="24">',
      '![A again](a.png)',
    ].join('\n');

    expect(mapAssetSources(content, toAssetRoute, APP)).toBe(
      [
        `![A](/file-content-assets/${APP}/a.png)`,
        `<img src="/file-content-assets/${APP}/b.svg" width="24"> <img src="/file-content-assets/${APP}/c.svg" width="24">`,
        `![A again](/file-content-assets/${APP}/a.png)`,
      ].join('\n'),
    );
  });

  it('leaves URLs that already say where to load from alone', () => {
    const content = [
      '![Remote](https://example.com/a.png)',
      '<img src="http://example.com/b.svg">',
      '![Inline](data:image/png;base64,AAAA)',
      '<img src="//cdn.example.com/c.png">',
    ].join('\n');

    expect(mapAssetSources(content, toAssetRoute, APP)).toBe(content);
  });

  it('maps the bare path when no root is given', () => {
    expect(mapAssetSources('![A](a.png)', toAssetRoute)).toBe(
      '![A](/file-content-assets/a.png)',
    );
  });

  it('does not touch other tags or links', () => {
    const content =
      '[a link](docs/guide.md) <a href="x.svg">x</a> <video src="v.mp4"></video>';

    expect(mapAssetSources(content, toAssetRoute, APP)).toBe(content);
  });
});
