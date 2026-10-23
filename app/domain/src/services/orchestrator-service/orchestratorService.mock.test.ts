import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addAppBrick,
  addAppSketchLibrary,
  applyBoardUpdate,
  checkBoardUpdate,
  cloneApp,
  createApp,
  deleteApp,
  deleteAppBrick,
  deleteAppSketchLibrary,
  deleteSystemProperty,
  getAppBrickInstance,
  getAppBricks,
  getAppDetail,
  getAppLogs,
  getAppPorts,
  getApps,
  getAppSketchLibraries,
  getAppStatus,
  getBoardUpdateLogs,
  getBrickDetails,
  getBricks,
  getConfig,
  getFileContent,
  getSerialMonitorLogs,
  getSketchLibraries,
  getSystemProperty,
  getSystemPropertyKeys,
  getSystemResources,
  getVersion,
  setOrchestratorService,
  startApp,
  stopApp,
  updateAppBrick,
  updateAppDetail,
  upsertSystemProperty,
} from './orchestratorService.impl';
import { MockOrchestratorService } from './orchestratorService.mock';

beforeAll(() => {
  setOrchestratorService(MockOrchestratorService);
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('orchestratorService.impl + MockOrchestratorService - getApps / getAppDetail', () => {
  it('getApps ritorna una lista di app', async () => {
    const apps = await getApps({});

    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThan(0);

    const first = apps[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('status');
  });

  it('getAppDetail returns app details', async () => {
    const apps = await getApps({});
    const source = apps[0];
    expect(source).toBeDefined();
    if (!source) expect.fail('no apps available in mock');

    const detail = await getAppDetail(source.id ?? '');

    expect(detail.id).toBe(source.id);
    expect(detail.name).toBe(source.name);
    expect(detail.status).toBe(source.status);
    expect(detail).toHaveProperty('description');
    expect(detail).toHaveProperty('example');
    expect(detail).toHaveProperty('default');
    expect(detail).toHaveProperty('path');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - updateAppDetail', () => {
  it('updateAppDetail aggiorna nome, descrizione e icona', async () => {
    const apps = await getApps({});
    const app = apps[0];

    const result = await updateAppDetail(app.id ?? '', {
      name: 'Updated Name',
      description: 'Updated Description',
      icon: '🔥',
    });

    expect(result).toBe(app.id);

    const updated = await getAppDetail(app.id ?? '');
    expect(updated.name).toBe('Updated Name');
    expect(updated.description).toBe('Updated Description');
    expect(updated.icon).toBe('🔥');
  });

  it('updateAppDetail imposta default=true e rimuove default dalle altre app', async () => {
    const apps = await getApps({});
    const firstApp = apps[0];
    const secondApp = apps[1];

    await updateAppDetail(secondApp.id ?? '', { default: true });

    const updatedApps = await getApps({});
    const first = updatedApps.find((a) => a.id === firstApp.id);
    const second = updatedApps.find((a) => a.id === secondApp.id);

    expect(second?.default).toBe(true);
    expect(first?.default).toBe(false);
  });

  it('updateAppDetail con default=false rimuove il flag default', async () => {
    const apps = await getApps({});
    const defaultApp = apps.find((a) => a.default);

    if (defaultApp) {
      await updateAppDetail(defaultApp.id ?? '', { default: false });

      const updated = await getAppDetail(defaultApp.id ?? '');
      expect(updated.default).toBe(false);
    }
  });
});

describe('orchestratorService.impl + MockOrchestratorService - getAppStatus (event stream)', () => {
  it('getAppStatus emette un evento apps-status con lo stato delle app', async () => {
    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();
    const abortController = new AbortController();

    await getAppStatus(
      { onopen, onmessage, onclose, onerror },
      abortController,
    );

    expect(onopen).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onerror).not.toHaveBeenCalled();
    expect(abortController.signal.aborted).toBe(true);

    expect(onmessage).toHaveBeenCalledTimes(1);
    const evt = onmessage.mock.calls[0][0];

    expect(evt.event).toBe('apps-status');

    const parsed = JSON.parse(evt.data);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('status');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - create / clone / delete', () => {
  it('createApp crea una nuova app con stato stopped', async () => {
    const appsBefore = await getApps({});

    const newId = await createApp({
      name: 'New App',
      description: 'desc',
      icon: '🧪',
    });

    expect(newId).toBeDefined();

    const appsAfter = await getApps({});
    expect(appsAfter.length).toBeGreaterThanOrEqual(appsBefore.length);

    const created = appsAfter.find((a) => a.id === newId);
    expect(created).toBeDefined();
    expect(created).toMatchObject({
      id: newId,
      name: 'New App',
      description: 'desc',
      icon: '🧪',
      status: 'stopped',
      example: false,
      default: false,
    });
  });

  it('cloneApp clona un\'app esistente con nuovo id e nome "[COPY] - <source.name>"', async () => {
    const apps = await getApps({});
    const source = apps[0];
    expect(source).toBeDefined();
    if (!source) expect.fail('no apps available in mock');

    const newId = await cloneApp(source.id ?? '');

    expect(newId).toBeDefined();

    const appsAfter = await getApps({});
    const cloned = appsAfter.find((a) => a.id === newId);

    expect(cloned).toBeDefined();
    expect(cloned).not.toBe(source);
    expect(cloned).toMatchObject({
      id: newId,
      name: `[COPY] - ${source.name}`,
      status: 'stopped',
      example: false,
      default: false,
    });
  });

  it('cloneApp con nome custom usa il nome fornito', async () => {
    const apps = await getApps({});
    const source = apps[0];

    const newId = await cloneApp(source.id ?? '', { name: 'Custom Clone' });

    const appsAfter = await getApps({});
    const cloned = appsAfter.find((a) => a.id === newId);

    expect(cloned?.name).toBe('Custom Clone');
  });

  it("deleteApp rimuove un'app esistente e ritorna true", async () => {
    const newId = await createApp({
      name: 'ToDelete',
      description: '',
      icon: '🗑️',
    });

    const appsBefore = await getApps({});
    const toDelete = appsBefore.find((a) => a.id === newId);
    expect(toDelete).toBeDefined();

    const result = await deleteApp(newId ?? '');
    expect(result).toBe(true);

    const appsAfter = await getApps({});
    const stillThere = appsAfter.find((a) => a.id === newId);
    expect(stillThere).toBeUndefined();
  });

  it("deleteApp ritorna false se l'app non esiste", async () => {
    const appsBefore = await getApps({});

    const result = await deleteApp('__nonexistent__');
    expect(result).toBe(false);

    const appsAfter = await getApps({});
    expect(appsAfter.length).toBeGreaterThanOrEqual(appsBefore.length);
  });
});

describe('orchestratorService.impl + MockOrchestratorService - startApp / stopApp', () => {
  it('startApp emette starting → running e aggiorna lo stato', async () => {
    const apps = await getApps({});
    const source = apps[0];
    expect(source).toBeDefined();
    if (!source) expect.fail('no apps available in mock');

    const appId = source.id ?? '';

    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();
    const abortController = new AbortController();

    await startApp(
      appId,
      { onopen, onmessage, onclose, onerror },
      abortController,
    );

    expect(onmessage).toHaveBeenCalledTimes(2);
    const firstEvt = onmessage.mock.calls[0][0];
    const secondEvt = onmessage.mock.calls[1][0];

    expect(firstEvt.event).toBe('message');
    expect(JSON.parse(firstEvt.data)).toEqual({
      id: appId,
      status: 'starting',
    });

    expect(secondEvt.event).toBe('message');
    expect(JSON.parse(secondEvt.data)).toEqual({
      id: appId,
      status: 'running',
    });
  });

  it('stopApp emette stopping → stopped e aggiorna lo stato', async () => {
    const apps = await getApps({});
    const source = apps[0];
    expect(source).toBeDefined();
    if (!source) expect.fail('no apps available in mock');

    const appId = source.id ?? '';

    await startApp(
      appId,
      {
        onopen: vi.fn(),
        onmessage: vi.fn(),
        onclose: vi.fn(),
        onerror: vi.fn(),
      },
      new AbortController(),
    );

    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();
    const abortController = new AbortController();

    await stopApp(
      appId,
      { onopen, onmessage, onclose, onerror },
      abortController,
    );

    expect(onmessage).toHaveBeenCalledTimes(2);
    const firstEvt = onmessage.mock.calls[0][0];
    const secondEvt = onmessage.mock.calls[1][0];

    expect(firstEvt.event).toBe('message');
    expect(JSON.parse(firstEvt.data)).toEqual({
      id: appId,
      status: 'stopping',
    });

    expect(secondEvt.event).toBe('message');
    expect(JSON.parse(secondEvt.data)).toEqual({
      id: appId,
      status: 'stopped',
    });
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Files', () => {
  it('getFileContent ritorna contenuto mock per README.md', async () => {
    const content = await getFileContent('/myapp/README.md');

    expect(content).toContain('README mock');
  });

  it('getFileContent ritorna contenuto mock per main.py', async () => {
    const content = await getFileContent('/myapp/python/main.py');

    expect(content).toContain('def main()');
    expect(content).toContain('hello from mock brick');
  });

  it('getFileContent ritorna contenuto mock per requirements.txt', async () => {
    const content = await getFileContent('/myapp/python/requirements.txt');

    expect(content).toContain('numpy');
    expect(content).toContain('opencv-python');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Bricks', () => {
  it('getBricks ritorna lista di brick disponibili', async () => {
    const bricks = await getBricks();

    expect(Array.isArray(bricks)).toBe(true);
    expect(bricks.length).toBeGreaterThan(0);
    expect(bricks[0]).toHaveProperty('id');
    expect(bricks[0]).toHaveProperty('name');
    expect(bricks[0]).toHaveProperty('category');
  });

  it('getBrickDetails ritorna dettagli di un brick', async () => {
    const details = await getBrickDetails('img-classification');

    expect(details.id).toBe('img-classification');
    expect(details.name).toBe('Image classification');
    expect(details).toHaveProperty('readme');
    expect(details).toHaveProperty('variables');
    expect(details).toHaveProperty('used_by_apps');
  });

  it('getBrickDetails ritorna dettagli mock per brick non definito', async () => {
    const details = await getBrickDetails('unknown-brick');

    expect(details.id).toBe('unknown-brick');
    expect(details.name).toContain('Mock brick');
    expect(details.status).toBe('experimental');
  });

  it('getAppBricks ritorna array vuoto per app senza brick', async () => {
    const bricks = await getAppBricks('999');

    expect(Array.isArray(bricks)).toBe(true);
    expect(bricks.length).toBe(0);
  });

  it("addAppBrick aggiunge un brick all'app", async () => {
    const apps = await getApps({});
    const appId = apps[0].id ?? '';

    const result = await addAppBrick(appId, 'img-classification', {});

    expect(result).toBe(true);

    const bricks = await getAppBricks(appId);
    const added = bricks.find((b) => b.id === 'img-classification');

    expect(added).toBeDefined();
    expect(added?.status).toBe('unconfigured');
    expect(added?.name).toBe('Image classification');
  });

  it('getAppBrickInstance ritorna istanza di brick per app', async () => {
    const apps = await getApps({});
    const appId = apps[0].id ?? '';

    await addAppBrick(appId, 'object-detection', {});

    const instance = await getAppBrickInstance(appId, 'object-detection');

    expect(instance.id).toBe('object-detection');
    expect(instance.name).toBe('Object detection');
    expect(instance).toHaveProperty('status');
  });

  it('updateAppBrick aggiorna configurazione brick', async () => {
    const apps = await getApps({});
    const appId = apps[0].id ?? '';

    await addAppBrick(appId, 'img-classification', {});

    const result = await updateAppBrick(appId, 'img-classification', {
      model: 'mobilenet',
      variables: {
        threshold: '0.8',
        top_k: '5',
      },
    });

    expect(result).toBe(true);

    const instance = await getAppBrickInstance(appId, 'img-classification');
    expect(instance.status).toBe('configured');
    expect(instance.model).toBe('mobilenet');
    expect(instance.variables?.threshold).toBe('0.8');
    expect(instance.variables?.top_k).toBe('5');
  });

  it("deleteAppBrick rimuove brick dall'app", async () => {
    const apps = await getApps({});
    const appId = apps[0].id ?? '';

    await addAppBrick(appId, 'text-generation', {});

    const bricksBefore = await getAppBricks(appId);
    expect(bricksBefore.some((b) => b.id === 'text-generation')).toBe(true);

    const result = await deleteAppBrick(appId, 'text-generation');
    expect(result).toBe(true);

    const bricksAfter = await getAppBricks(appId);
    expect(bricksAfter.some((b) => b.id === 'text-generation')).toBe(false);
  });

  it('deleteAppBrick ritorna false per brick inesistente', async () => {
    const result = await deleteAppBrick('999', 'nonexistent');

    expect(result).toBe(false);
  });
});

describe('orchestratorService.impl + MockOrchestratorService - App Logs', () => {
  it('getAppLogs emette eventi di log tramite EventSource', async () => {
    const apps = await getApps({});
    const appId = apps[0].id ?? '';

    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();
    const abortController = new AbortController();

    await getAppLogs(
      appId,
      { onopen, onmessage, onclose, onerror },
      abortController,
    );

    expect(onopen).toHaveBeenCalledTimes(1);
    expect(onmessage).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onerror).not.toHaveBeenCalled();

    const firstMessage = onmessage.mock.calls[0][0];
    const parsed = JSON.parse(firstMessage.data);

    expect(parsed).toHaveProperty('stream');
    expect(parsed).toHaveProperty('message');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Serial Monitor', () => {
  it('getSerialMonitorLogs ritorna WebSocket mock funzionante', async () => {
    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();

    const ws = await getSerialMonitorLogs({
      onopen,
      onmessage,
      onclose,
      onerror,
    });

    expect(onopen).toHaveBeenCalledTimes(1);
    expect(onmessage).toHaveBeenCalled();

    expect(ws).toBeDefined();
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.send('test command');
    expect(onmessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining('Echo from mock serial'),
      }),
    );

    ws.close();
    expect(onclose).toHaveBeenCalledTimes(1);
  });
});

describe('orchestratorService.impl + MockOrchestratorService - App Ports', () => {
  it('getAppPorts ritorna array di porte per app', async () => {
    const apps = await getApps({});
    const appId = apps[0].id ?? '';

    const ports = await getAppPorts(appId);

    expect(Array.isArray(ports)).toBe(true);
    expect(ports.length).toBeGreaterThan(0);
    expect(ports[0]).toHaveProperty('source');
    expect(ports[0]).toHaveProperty('serviceName');
    expect(ports[0]).toHaveProperty('port');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Config', () => {
  it('getConfig ritorna oggetto di configurazione', async () => {
    const config = await getConfig();

    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - System Resources', () => {
  it('getSystemResources esegue senza errori', async () => {
    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();
    const abortController = new AbortController();

    await expect(
      getSystemResources(
        { onopen, onmessage, onclose, onerror },
        abortController,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Board Updates', () => {
  it('checkBoardUpdate ritorna lista di aggiornamenti disponibili', async () => {
    const result = await checkBoardUpdate(false);

    expect(result).toHaveProperty('updates');
    expect(result.updates === null || Array.isArray(result.updates)).toBe(true);
    if (result.updates && result.updates.length > 0) {
      expect(result.updates[0]).toHaveProperty('name');
      expect(result.updates[0]).toHaveProperty('from_version');
      expect(result.updates[0]).toHaveProperty('to_version');
      expect(result.updates[0]).toHaveProperty('type');
    }
  });

  it('getBoardUpdateLogs esegue senza errori', async () => {
    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    const onerror = vi.fn();
    const abortController = new AbortController();

    await expect(
      getBoardUpdateLogs(
        { onopen, onmessage, onclose, onerror },
        abortController,
      ),
    ).resolves.toBeUndefined();
  });

  it('applyBoardUpdate ritorna true per successo', async () => {
    const result = await applyBoardUpdate(false);

    expect(result).toBe(true);
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Version', () => {
  it('getVersion ritorna stringa versione', async () => {
    const version = await getVersion();

    expect(typeof version).toBe('string');
    expect(version).toContain('mock');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - System Properties', () => {
  it('getSystemPropertyKeys ritorna array di chiavi', async () => {
    const keys = await getSystemPropertyKeys();

    expect(Array.isArray(keys)).toBe(true);
  });

  it('getSystemProperty ritorna valore proprietà', async () => {
    const result = await getSystemProperty('test-key');

    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('value');
    expect(result.key).toBe('test-key');
  });

  it('upsertSystemProperty crea o aggiorna proprietà', async () => {
    const result = await upsertSystemProperty('new-key', 'new-value');

    expect(result.key).toBe('new-key');
    expect(result.value).toBe('new-value');
  });

  it('deleteSystemProperty rimuove proprietà', async () => {
    const result = await deleteSystemProperty('old-key');

    expect(result.key).toBe('old-key');
  });
});

describe('orchestratorService.impl + MockOrchestratorService - Sketch Libraries', () => {
  it('getSketchLibraries ritorna lista paginata di librerie', async () => {
    const result = await getSketchLibraries({});

    expect(result).toHaveProperty('libraries');
    expect(result).toHaveProperty('pagination');
    expect(Array.isArray(result.libraries)).toBe(true);
    expect(result.pagination).toHaveProperty('page');
    expect(result.pagination).toHaveProperty('per_page');
    expect(result.pagination).toHaveProperty('total_pages');
    expect(result.pagination).toHaveProperty('total_items');
  });

  it('getSketchLibraries filtra per query di ricerca', async () => {
    const result = await getSketchLibraries({
      query: { search: 'BLE' },
    });

    expect(result.libraries?.length).toBeGreaterThan(0);
    expect(
      result.libraries?.some((lib) => lib.name?.includes('BLE')) ?? false,
    ).toBe(true);
  });

  it('getSketchLibraries supporta paginazione', async () => {
    const page1 = await getSketchLibraries({
      query: { page: 1, limit: 1 },
    });

    expect(page1.libraries).toBeDefined();
    expect(page1.libraries?.length).toBe(1);
    expect(page1.pagination?.page).toBe(1);
    expect(page1.pagination?.per_page).toBe(1);
  });
  it('getAppSketchLibraries ritorna librerie installate per app', async () => {
    const result = await getAppSketchLibraries('1');

    expect(result).toHaveProperty('libraries');
    expect(Array.isArray(result.libraries)).toBe(true);
  });

  it("addAppSketchLibrary aggiunge libreria all'app", async () => {
    const appId = '1';

    await addAppSketchLibrary(appId, 'WiFiNINA@1.8.14');

    const result = await getAppSketchLibraries(appId);
    expect(result.libraries).toContain('WiFiNINA@1.8.14');
  });

  it('addAppSketchLibrary con solo id usa ultima versione', async () => {
    const appId = '2';

    await addAppSketchLibrary(appId, 'ArduinoBLE');

    const result = await getAppSketchLibraries(appId);
    expect(result.libraries.some((lib) => lib.startsWith('ArduinoBLE@'))).toBe(
      true,
    );
  });

  it('deleteAppSketchLibrary rimuove libreria specifica', async () => {
    const appId = '4';

    const before = await getAppSketchLibraries(appId);
    const toDelete = before.libraries[0];

    await deleteAppSketchLibrary(appId, toDelete);

    const after = await getAppSketchLibraries(appId);
    expect(after.libraries).not.toContain(toDelete);
  });

  it('deleteAppSketchLibrary con solo id rimuove tutte le versioni', async () => {
    const appId = '4';

    await addAppSketchLibrary(appId, 'ArduinoBLE@1.3.0');
    await addAppSketchLibrary(appId, 'ArduinoBLE@1.2.0');

    await deleteAppSketchLibrary(appId, 'ArduinoBLE');

    const result = await getAppSketchLibraries(appId);
    expect(result.libraries.some((lib) => lib.startsWith('ArduinoBLE'))).toBe(
      false,
    );
  });
});
