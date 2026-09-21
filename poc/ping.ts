/**
 * 疎通確認: 最小の Noul 1 問を投げて、キー・エンドポイント・レイテンシを確認する。
 */
import { callJev, resolveProvider } from './jev-client';

const cfg = resolveProvider();
console.log(`provider: ${cfg.provider}\nurl: ${cfg.url}\nmodel: ${cfg.model}`);

const { response, latencyMs, url } = await callJev(
  {
    state: { message: 'メールアドレスを入力してください' },
    questions: {
      asks_email: {
        type: 'noul',
        instructions: 'Does `message` ask the user for an email address?',
      },
    },
  },
  cfg,
);

console.log(`\nok via ${url}`);
console.log(`model: ${response.model}  latency: ${Math.round(latencyMs)}ms  usage:`, response.usage);
console.log('answers:', JSON.stringify(response.answers));
