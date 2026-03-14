import http from 'http';
import { textTranslations } from './route-handlers.js';
import { encryptTranslationValues } from './translation-crypto';

export type ScenarioName =
  | 'success'
  | 'networkFailure'
  | 'apiTimeout'
  | 'malformedResponse'
  | 'notFound404'
  | 'server500Error'
  | 'spanishFails'
  | 'emptyResponse'
  | 'slowSuccess';

export const MOCK_API_PORT = 4000;
export const MOCK_API_HEALTH_PATH = '/__18ways_mock_api_health';

function createTranslateResponse(
  postData: any,
  scenario: ScenarioName
): { status: number; body: string } {
  if (scenario === 'networkFailure') {
    // For network failure, just close the connection
    return { status: 500, body: '' };
  }

  if (scenario === 'server500Error') {
    return { status: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }

  if (scenario === 'notFound404') {
    return { status: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  if (scenario === 'malformedResponse') {
    return { status: 200, body: 'not valid json {{{' };
  }

  if (scenario === 'emptyResponse') {
    return { status: 200, body: JSON.stringify({ data: [], errors: [] }) };
  }

  if (scenario === 'spanishFails') {
    const results =
      postData?.payload
        ?.map((item: any) => {
          const { key, targetLocale, textsHash, texts } = item;

          // Fail for Spanish
          if (targetLocale === 'es-ES') {
            return null;
          }

          const translation = texts.map((text: string) => {
            return textTranslations[text]?.[targetLocale] || text;
          });

          return {
            locale: targetLocale,
            key,
            textsHash,
            translation: encryptTranslationValues({
              translatedTexts: translation,
              sourceTexts: texts,
              locale: targetLocale,
              key,
              textsHash,
            }),
          };
        })
        .filter(Boolean) || [];

    return { status: 200, body: JSON.stringify({ data: results, errors: [] }) };
  }

  // success and slowSuccess scenarios (slowSuccess delay handled elsewhere)
  const results =
    postData?.payload?.map((item: any) => {
      const { key, targetLocale, textsHash, texts } = item;
      const translation = texts.map((text: string) => {
        return textTranslations[text]?.[targetLocale] || text;
      });
      return {
        locale: targetLocale,
        key,
        textsHash,
        translation: encryptTranslationValues({
          translatedTexts: translation,
          sourceTexts: texts,
          locale: targetLocale,
          key,
          textsHash,
        }),
      };
    }) || [];

  return { status: 200, body: JSON.stringify({ data: results, errors: [] }) };
}

function createSeedResponse(
  postData: any,
  scenario: ScenarioName
): { status: number; body: string } {
  if (scenario === 'networkFailure' || scenario === 'server500Error') {
    return { status: 500, body: JSON.stringify({ data: {}, errors: [] }) };
  }

  if (scenario === 'notFound404') {
    return { status: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  const { keys, targetLocale } = postData || {};

  if (!keys || !Array.isArray(keys) || !targetLocale) {
    return { status: 200, body: JSON.stringify({ data: {}, errors: [] }) };
  }

  // Seed endpoint receives context keys (like "app") but textTranslations is keyed by actual text
  // In a real implementation, the backend would look up translations by context key
  // For now, return empty data and let the /translate endpoint handle actual translations
  const seedData: Record<string, string[]> = {};

  return { status: 200, body: JSON.stringify({ data: seedData, errors: [] }) };
}

export function createMockApiServer(scenario: ScenarioName): http.Server {
  const server = http.createServer((req, res) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === MOCK_API_HEALTH_PATH && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            service: '18ways-e2e-mock-api',
            scenario,
          })
        );
      } else if (req.url === '/translate' && req.method === 'POST') {
        const postData = JSON.parse(body || '{}');
        const response = createTranslateResponse(postData, scenario);
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(response.body);
      } else if (req.url === '/seed' && req.method === 'POST') {
        const postData = JSON.parse(body || '{}');
        const response = createSeedResponse(postData, scenario);
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(response.body);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });

  return server;
}

async function verifyExistingMockApiServer(scenario: ScenarioName): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: MOCK_API_PORT,
        path: MOCK_API_HEALTH_PATH,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }

          try {
            const payload = JSON.parse(body || '{}') as {
              service?: string;
              scenario?: string;
            };
            resolve(payload.service === '18ways-e2e-mock-api' && payload.scenario === scenario);
          } catch {
            resolve(false);
          }
        });
      }
    );

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function startMockApiServer(scenario: ScenarioName): Promise<http.Server | null> {
  const server = createMockApiServer(scenario);
  let reusingExistingServer = false;

  await new Promise<void>((resolve, reject) => {
    const cleanupListeners = () => {
      server.removeAllListeners('listening');
      server.removeAllListeners('error');
    };

    server.on('listening', () => {
      cleanupListeners();
      resolve();
    });

    server.listen(MOCK_API_PORT, () => {
      // Handled by the listening event so cleanup is centralized.
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        void (async () => {
          cleanupListeners();
          reusingExistingServer = await verifyExistingMockApiServer(scenario);
          if (reusingExistingServer) {
            console.log(
              `⚠️  Port ${MOCK_API_PORT} already in use, reusing matching mock API server`
            );
            resolve();
            return;
          }

          reject(
            new Error(
              `Port ${MOCK_API_PORT} is already in use by a non-mock service or a mock server with a different scenario`
            )
          );
        })();
      } else {
        cleanupListeners();
        reject(err);
      }
    });
  });

  return reusingExistingServer ? null : server;
}

export function stopMockApiServer(server: http.Server | null): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      resolve();
    });
    server.once('error', () => {
      resolve();
    });
  });
}
