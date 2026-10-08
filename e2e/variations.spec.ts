/**
 * 実サイトに近い多様なマークアップのフォーム（e2e/fixtures/variations/*.html）で、
 * 抽出 → 値の整形 → 注入までを検証する。
 *
 * フィクスチャ側の約束:
 * - `data-key`: その欄の正解の判定キー（モックの Jev はこれを返す）。無ければ none
 * - `data-expect`: 入力後に入っているべき値（空文字 = 触らない）。`{{age}}` は年齢に置き換える
 * - `data-expect-any`: `|` 区切りのどれかに一致すればよい
 * - `data-expect-checked`: radio / checkbox のチェック状態
 *
 * 既定はモックの Jev（正解を返す）で、判定以外の部分を検証する。
 * `E2E_REAL_JEV=1` のときは本番の中継サーバー（実際の Jev）を呼び、判定を含めた結果を
 * test-results/variations-real-jev.md に書き出す（精度の確認用。不一致があってもテストは落とさない）。
 * 中継サーバーは IP 単位で 20 回/分に制限しているため、実 Jev モードではフォームごとに間隔を空ける。
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { calculateAge } from '../src/shared/derive';
import type { FieldOutcome, FillResult, Profile } from '../src/shared/types';
import { buildChoiceAnswer, buildTestProfile, buildTestSettings, TEST_PROFILE_FIELDS } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { JevHandler, MockServer } from './mock-server';

const REAL_JEV = process.env.E2E_REAL_JEV === '1';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VARIATIONS_DIR = join(ROOT, 'e2e', 'fixtures', 'variations');
const FILES = readdirSync(VARIATIONS_DIR)
  .filter((f) => f.endsWith('.html'))
  .sort();

const AGE = String(calculateAge(TEST_PROFILE_FIELDS.birth_date) ?? '');

function buildVariationProfile(): Profile {
  const base = buildTestProfile('profile-variations');
  return {
    ...base,
    fields: {
      ...base.fields,
      website: 'https://e2e.example.test',
      city_kana: 'チヨダク',
      address_line1_kana: 'チヨダ9-9-9',
      address_line2_kana: 'イーツーイータワー505',
      bank_name: 'テスト銀行',
      bank_code: '0001',
      branch_name: '本店',
      branch_code: '100',
      account_type: 'ordinary',
      account_number: '1234567',
      sns_x: '@e2e_ichiro',
      sns_instagram: 'e2e_ichiro',
      sns_youtube: 'e2eichiro',
      sns_github: 'e2e-ichiro',
    },
  };
}

interface Expectation {
  /** 表示用: id または name */
  ref: string;
  id: string | null;
  name: string | null;
  key: string | null;
  type: 'value' | 'checked';
  expected: string[];
  actual: string;
}

/** ページ内（open shadow root も含む）の data-expect* を持つ要素を読み取る */
async function readExpectations(page: Page): Promise<Expectation[]> {
  const raw = await page.evaluate(() => {
    const out: Array<{
      id: string | null;
      name: string | null;
      key: string | null;
      expect: string | null;
      expectAny: string | null;
      expectChecked: string | null;
      value: string;
      checked: boolean;
    }> = [];
    const visit = (root: Document | ShadowRoot) => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if (el.shadowRoot) visit(el.shadowRoot);
        const isField = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
        if (!isField) continue;
        const expect = el.getAttribute('data-expect');
        const expectAny = el.getAttribute('data-expect-any');
        const expectChecked = el.getAttribute('data-expect-checked');
        if (expect === null && expectAny === null && expectChecked === null) continue;
        const f = el as HTMLInputElement;
        out.push({
          id: el.getAttribute('id'),
          name: el.getAttribute('name'),
          key: el.getAttribute('data-key'),
          expect,
          expectAny,
          expectChecked,
          value: f.value,
          checked: !!f.checked,
        });
      }
    };
    visit(document);
    return out;
  });

  return raw.map((r) => {
    const ref = r.id ?? r.name ?? '?';
    if (r.expectChecked !== null) {
      return { ref, id: r.id, name: r.name, key: r.key, type: 'checked', expected: [r.expectChecked], actual: String(r.checked) };
    }
    const expected = (r.expectAny ?? r.expect ?? '').split('|').map((v) => v.replace('{{age}}', AGE));
    return { ref, id: r.id, name: r.name, key: r.key, type: 'value', expected, actual: r.value };
  });
}

/** フィクスチャの data-key を正解として返すモック。フィールドは id → name の順で照合する */
function buildKeyedHandler(expectations: Expectation[]): JevHandler {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of expectations) {
    if (!e.key) continue;
    if (e.id) byId.set(e.id, e.key);
    if (e.name) byName.set(e.name, e.key);
  }
  return (rawBody) => {
    const body = rawBody as { fields?: Record<string, { id?: string; name?: string }> };
    const answers: Record<string, unknown> = {};
    for (const [fid, field] of Object.entries(body.fields ?? {})) {
      const key = (field.id && byId.get(field.id)) || (field.name && byName.get(field.name)) || 'none';
      answers[fid] = buildChoiceAnswer(key);
    }
    return { status: 200, body: { model: 'typesafe/jev-mock', answers, usage: { input_tokens: 1000, output_tokens: 10 } } };
  };
}

async function waitForResult(popupPage: Page, since: string): Promise<{ result: FillResult; details: FieldOutcome[] }> {
  await expect
    .poll(
      async () =>
        popupPage.evaluate(async (s) => {
          const { lastResult } = await chrome.storage.local.get('lastResult');
          const r = lastResult as { at?: string; errorKind?: string; error?: string } | undefined;
          // 実行開始時に「完了しなかった」印の結果が先に書かれるので、それは待ち続ける
          return !!r?.at && r.at > s && r.error !== '前回の実行が完了しませんでした';
        }, since),
      { timeout: 30_000 },
    )
    .toBe(true);
  return popupPage.evaluate(async () => {
    const stored = await chrome.storage.local.get(['lastResult', 'lastResultDetail']);
    return { result: stored.lastResult, details: stored.lastResultDetail ?? [] } as unknown;
  }) as Promise<{ result: FillResult; details: FieldOutcome[] }>;
}

const realReport: string[] = [];

test.describe(`多様なフォームのバリエーション（${REAL_JEV ? '実 Jev' : 'モック'}）`, () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
    if (REAL_JEV && realReport.length > 0) {
      const dir = join(ROOT, 'test-results');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'variations-real-jev.md'), `# 実 Jev でのバリエーションテスト結果\n\n${realReport.join('\n')}\n`, 'utf8');
    }
  });

  for (const file of FILES) {
    test(file, async ({ context, extensionId }) => {
      if (REAL_JEV) await new Promise((r) => setTimeout(r, 4000));

      const profile = buildVariationProfile();
      await seedStorage(context, extensionId, {
        profiles: [profile],
        settings: buildTestSettings({ workerEndpoint: REAL_JEV ? undefined : server.jevUrl }),
      });

      const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/variations/${file}`);
      // SPA のフォームは読み込み後に描画される
      await formPage.waitForSelector('button[type="submit"], input[type="submit"]');
      await formPage.waitForTimeout(200);

      const before = await readExpectations(formPage);
      if (!REAL_JEV) server.setJevHandler(buildKeyedHandler(before));

      const since = new Date(Date.now() - 1000).toISOString();
      await clickRunButton(popupPage, 'このページに入力');
      const { result, details } = await waitForResult(popupPage, since);
      expect(result.error, `実行エラー: ${result.error}`).toBeUndefined();

      // ページ側のスクリプト（SPA の再描画など）が落ち着くのを待つ
      await formPage.waitForTimeout(500);
      const after = await readExpectations(formPage);

      const mismatches = after.filter((e) => !e.expected.includes(e.actual));

      if (REAL_JEV) {
        const total = after.length;
        const lines = [
          `## ${file}`,
          '',
          `正解 ${total - mismatches.length} / ${total}（入力 ${result.filled}、確信度不足 ${result.skippedLowConfidence}、該当なし ${result.noMatch}、その他スキップ ${result.skippedOther}、${result.latencyMs}ms）`,
          '',
        ];
        if (mismatches.length > 0) {
          lines.push('| 欄 | 正解キー | 期待 | 実際 |', '|---|---|---|---|');
          for (const m of mismatches) {
            lines.push(`| ${m.ref} | ${m.key ?? 'none'} | ${m.expected.join(' / ') || '（空）'} | ${m.actual || '（空）'} |`);
          }
          lines.push('');
        }
        lines.push('<details><summary>判定の内訳</summary>', '', '| id | ラベル | 判定 | 確信度 | 結果 |', '|---|---|---|---|---|');
        for (const d of details) {
          lines.push(`| ${d.fieldId} | ${d.label.replace(/\|/g, '/').slice(0, 40)} | ${d.choice ?? '-'} | ${d.confidence?.toFixed(2) ?? '-'} | ${d.reason} |`);
        }
        lines.push('', '</details>', '');
        realReport.push(lines.join('\n'));
        console.log(`[real-jev] ${file}: ${total - mismatches.length}/${total}`);
      } else {
        for (const e of after) {
          expect.soft(e.expected, `${file} の ${e.ref}（${e.key ?? 'none'}）: 実際は「${e.actual}」`).toContain(e.actual);
        }
      }

      await formPage.close();
      await popupPage.close();
    });
  }
});
