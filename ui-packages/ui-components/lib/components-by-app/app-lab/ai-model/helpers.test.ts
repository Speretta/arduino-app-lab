import { describe, expect, it } from 'vitest';

import { BrickDetailModel } from './AiModel.type';
import {
  canDownloadModel,
  canUninstallModel,
  getDownloadableSourceUrl,
  getHuggingFaceModelPlaceholderName,
  getModelDisplayName,
  getModelPageUrl,
} from './helpers';

const REPO = 'unsloth/SmolLM2-135M-Instruct-GGUF';
const FILE = 'SmolLM2-135M-Instruct-Q4_K_M';
const REPO_PLACEHOLDER = `${REPO}/SmolLM2-135M-Instruct-GGUF`;
const FILE_URL = `https://huggingface.co/${REPO}/blob/main/${FILE}.gguf`;
const EI_STUDIO_URL = 'https://studio.edgeimpulse.com/studio/757509/live';

const model = (overrides: Partial<BrickDetailModel>): BrickDetailModel => ({
  id: '',
  name: '',
  description: '',
  source: 'huggingface',
  origin: 'curated',
  isBuiltIn: false,
  isInstalled: false,
  metadata: {},
  ...overrides,
});

describe('getHuggingFaceModelPlaceholderName', () => {
  it.each([
    ['a blob URL', FILE_URL, `${REPO}/${FILE}`],
    [
      'a resolve URL',
      `https://huggingface.co/${REPO}/resolve/main/${FILE}.gguf`,
      `${REPO}/${FILE}`,
    ],
    [
      'a URL with a query string',
      `${FILE_URL}?download=true`,
      `${REPO}/${FILE}`,
    ],
    // A fragment is not part of the file name, so the stem still reads.
    ['a URL with a fragment', `${FILE_URL}#files`, `${REPO}/${FILE}`],
    // The downloader compares the extension lowercased, so this installs.
    [
      'a URL with an uppercase extension',
      `https://huggingface.co/${REPO}/resolve/main/${FILE}.GGUF`,
      `${REPO}/${FILE}`,
    ],
    // No file is named, so the repository is as far as it can be named.
    ['a repository URL', `https://huggingface.co/${REPO}`, REPO_PLACEHOLDER],
    ['a bare repository key', REPO, REPO_PLACEHOLDER],
    ['a key with a quantization', `${REPO}:Q4_0`, `${REPO_PLACEHOLDER}:Q4_0`],
    [
      'a key with a model type',
      `llamacpp:${REPO}:Q4_0:F16`,
      `${REPO_PLACEHOLDER}:Q4_0`,
    ],
    // Named as the board names the installed file, the same as its URL.
    ['a key naming a file', `${REPO}:${FILE}.gguf`, `${REPO}/${FILE}`],
    [
      'a URL with a scheme that is not http',
      `ftp://example.com/${REPO}`,
      REPO_PLACEHOLDER,
    ],
    ['a URL that does not parse', 'https://', 'https://'],
  ])('names %s', (_case, source, expected) => {
    expect(getHuggingFaceModelPlaceholderName(source)).toBe(expected);
  });

  it.each([
    ['a key with a quantization', `${REPO}:Q4_0`],
    ['a bare repository key', REPO],
    ['a repository URL', `https://huggingface.co/${REPO}`],
  ])('names %s after the file in download', (_case, source) => {
    expect(getHuggingFaceModelPlaceholderName(source, `${FILE}.gguf`)).toBe(
      `${REPO}/${FILE}`,
    );
  });

  it('ignores a file name that is not a model file', () => {
    expect(getHuggingFaceModelPlaceholderName(`${REPO}:Q4_0`, 'README.md')).toBe(
      `${REPO_PLACEHOLDER}:Q4_0`,
    );
  });
});

describe('getModelDisplayName', () => {
  it('splits the name of a model named by its download path', () => {
    expect(
      getModelDisplayName(
        model({
          id: `llamacpp:${REPO}/${FILE}`,
          name: `${REPO}/${FILE}`,
          origin: 'user',
        }),
      ),
    ).toEqual({ title: FILE, repository: REPO });
  });

  it('splits the placeholder shown while a link installs', () => {
    expect(
      getModelDisplayName(
        model({
          id: FILE_URL,
          name: `${REPO}/${FILE}`,
          origin: 'user',
          isPlaceholder: true,
        }),
      ),
    ).toEqual({ title: FILE, repository: REPO });
  });

  it('leaves a declared name alone', () => {
    expect(
      getModelDisplayName(
        model({
          id: 'llamacpp:Qwen3.5-2B-Q4_K_M',
          name: 'Qwen3.5 2B',
          origin: 'curated',
        }),
      ),
    ).toEqual({ title: 'Qwen3.5 2B' });
  });

  it('keeps the slashes of a name that is not a download path', () => {
    // An Edge Impulse card is named by its project, whose name is free text its
    // owner typed in the studio.
    expect(
      getModelDisplayName(
        model({
          id: '717280',
          name: 'Arduino / gesture v2',
          origin: 'edge-impulse-user-project',
        }),
      ),
    ).toEqual({ title: 'Arduino / gesture v2' });
  });

  it('keeps whole the name of a curated model whose id repeats it', () => {
    // The old heuristic read `id.endsWith(':' + name)` as "named by its download
    // path". A declared model whose id is its name behind a framework prefix
    // matches that shape and must still be shown whole.
    expect(
      getModelDisplayName(
        model({
          id: 'llamacpp:arduino/vision-v1',
          name: 'arduino/vision-v1',
          origin: 'curated',
        }),
      ),
    ).toEqual({ title: 'arduino/vision-v1' });
  });
});

describe('getModelPageUrl', () => {
  it('drops the revision and file a download url names', () => {
    expect(
      getModelPageUrl(
        `https://huggingface.co/${REPO}/resolve/main/${FILE}.gguf`,
      ),
    ).toBe(`https://huggingface.co/${REPO}`);
  });

  it('reads the browser url for the same file', () => {
    expect(getModelPageUrl(FILE_URL)).toBe(`https://huggingface.co/${REPO}`);
  });

  it('drops a query the download button appends', () => {
    expect(
      getModelPageUrl(
        `https://huggingface.co/${REPO}/resolve/main/${FILE}.gguf?download=true`,
      ),
    ).toBe(`https://huggingface.co/${REPO}`);
  });

  it('keeps a revision that is a commit rather than a branch', () => {
    expect(
      getModelPageUrl(
        `https://huggingface.co/${REPO}/resolve/f4db1b3/${FILE}.gguf`,
      ),
    ).toBe(`https://huggingface.co/${REPO}`);
  });

  it('leaves a url whose first segment is the marker alone', () => {
    // marker at index 0 names no repository: truncating would give a bare origin.
    const url = 'https://huggingface.co/resolve/main/m.gguf';

    expect(getModelPageUrl(url)).toBe(url);
  });

  it('leaves a tree view alone: it is a page already', () => {
    const url = `https://huggingface.co/${REPO}/tree/main/subdir`;

    expect(getModelPageUrl(url)).toBe(url);
  });

  it('leaves a repository url alone, having no file to drop', () => {
    expect(getModelPageUrl(`https://huggingface.co/${REPO}`)).toBe(
      `https://huggingface.co/${REPO}`,
    );
  });

  it('leaves another host alone: only Hugging Face is downloaded from a link', () => {
    // A curated model links its own page, which is already what to open.
    const page = 'https://aihub.qualcomm.com/models/face_det_lite';

    expect(getModelPageUrl(page)).toBe(page);
  });

  it.each([
    ['a bare repository', REPO],
    ['a quantization', `${REPO}:Q4_0`],
    ['a model type', `llamacpp:${REPO}:Q4_0:F16`],
  ])('opens the repository page of a key with %s', (_case, key) => {
    expect(getModelPageUrl(key)).toBe(`https://huggingface.co/${REPO}`);
  });

  it('opens the page of a key without an owner', () => {
    expect(getModelPageUrl('gpt2')).toBe('https://huggingface.co/gpt2');
  });

  it('leaves an empty source alone', () => {
    expect(getModelPageUrl('')).toBe('');
  });

  it.each([
    ['a scheme that is not http', `ftp://example.com/${REPO}`],
    ['a url that does not parse', 'https://'],
  ])('reads %s as a url, not a key', (_case, url) => {
    expect(getModelPageUrl(url)).toBe(url);
  });
});

describe('getDownloadableSourceUrl', () => {
  it("reads the url the board's list declares for the model", () => {
    expect(
      getDownloadableSourceUrl(
        model({ metadata: { 'source-model-url': FILE_URL } }),
      ),
    ).toBe(FILE_URL);
  });

  // Edge Impulse models install through their own route, and `isEdgeImpulse`
  // keeps their cards off this path, so the source no longer hides the url.
  it('reads the url whatever the source names', () => {
    expect(
      getDownloadableSourceUrl(
        model({
          metadata: {
            source: 'edgeimpulse',
            'source-model-url': FILE_URL,
          },
        }),
      ),
    ).toBe(FILE_URL);
  });

  it('names no url for a model carrying no declared url', () => {
    expect(getDownloadableSourceUrl(model({}))).toBeUndefined();
  });
});

describe('what install state allows', () => {
  // The board can install anything it lists: a model it declares goes in from
  // its id, and a linked one is listed only once its files are there. So the
  // url decides neither action. Nine of the thirteen models a UNO Q lists carry
  // an `edgeimpulse` source, which hides the url they do have.
  const cases: [string, BrickDetailModel['origin'], Record<string, string>][] =
    [
      [
        'a model with a declared url',
        'curated',
        { 'source-model-url': FILE_URL },
      ],
      [
        'an Edge Impulse model the board declares',
        'curated',
        { source: 'edgeimpulse', 'source-model-url': EI_STUDIO_URL },
      ],
      ['a model the user linked', 'user', { 'source-model-url': FILE_URL }],
      [
        'a model from a daemon that sends no origin',
        undefined,
        { 'source-model-url': FILE_URL },
      ],
    ];

  it.each(cases)(
    'follows install state alone for %s',
    (_label, origin, metadata) => {
      const uninstalled = model({ origin, metadata, isInstalled: false });
      const installed = model({ origin, metadata, isInstalled: true });

      expect(canDownloadModel(uninstalled)).toBe(true);
      expect(canUninstallModel(uninstalled)).toBe(false);

      expect(canDownloadModel(installed)).toBe(false);
      expect(canUninstallModel(installed)).toBe(true);
    },
  );

  // An Edge Impulse card acts on a chosen impulse, so the model-level question
  // answers no however its url and install state read.
  it.each([true, false])(
    'answers no for an Edge Impulse card (installed: %s)',
    (isInstalled) => {
      const card = model({
        isInstalled,
        metadata: { 'source-model-url': EI_STUDIO_URL },
        edgeImpulseProps: { projectId: '757509', impulses: [] },
      });

      expect(canDownloadModel(card)).toBe(false);
      expect(canUninstallModel(card)).toBe(false);
    },
  );

  it.each([true, false])(
    'offers neither for a model with no declared url (installed: %s)',
    (isInstalled) => {
      const bare = model({ isInstalled });

      expect(canDownloadModel(bare)).toBe(false);
      expect(canUninstallModel(bare)).toBe(false);
    },
  );
});
