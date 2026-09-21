/**
 * E2E 用のローカルモック HTTP サーバー。
 * - 静的フォーム HTML（e2e/fixtures/*.html）の配信
 * - Jev API のモック（CORS ヘッダ付き。テストごとにハンドラを差し替え可能）
 * 実 Jev API（api.typesafe.ai / openrouter.ai）へは一切通信しない。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

export interface JevHandlerResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export type JevHandler = (body: unknown, req: IncomingMessage) => JevHandlerResult | Promise<JevHandlerResult>;

export interface MockServer {
  url: string;
  jevUrl: string;
  requests: Array<{ path: string; body: unknown }>;
  setJevHandler: (handler: JevHandler) => void;
  close: () => Promise<void>;
}

const DEFAULT_HANDLER: JevHandler = () => ({ status: 200, body: { answers: {} } });

export function startMockServer(): Promise<MockServer> {
  return new Promise((resolve, reject) => {
    const requests: MockServer['requests'] = [];
    let handler: JevHandler = DEFAULT_HANDLER;

    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            /* 不正な JSON はそのまま空オブジェクトとして扱う */
          }
          requests.push({ path: url, body: parsed });
          const result = await handler(parsed, req);
          for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
        });
        return;
      }

      // 静的フォーム HTML の配信（file:// ではなく http:// にすることで
      // activeTab / scripting の実際の権限モデルに近い状態でテストする）
      void (async () => {
        const safePath = normalize(url.split('?')[0] ?? '/').replace(/^\/+/, '');
        const filePath = join(FIXTURES_DIR, safePath || 'index.html');
        try {
          const content = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('not found');
        }
      })();
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        jevUrl: `${url}/v1/systemone`,
        requests,
        setJevHandler: (h) => {
          handler = h;
        },
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
