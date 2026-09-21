/**
 * PoC 本体: 各フォームを 1 リクエストで Jev に投げ、フィールド → プロフィール項目の対応付け精度を測る。
 *
 * 使い方:
 *   npm run poc                                  # 全バリアント × 全フォーム
 *   npm run poc -- --variants full,label-only    # バリアントを絞る
 *   npm run poc -- --forms ec-signup,contact-cf7 # フォームを絞る
 *   npm run poc -- --repeat 3                    # 同じリクエストを繰り返して揺らぎを見る
 *   npm run poc -- --dump                        # リクエスト JSON を results/ に保存（API は呼ばない）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMS, type FormFixture } from './fixtures/forms';
import { buildRequest, VARIANTS, type Variant } from './build-request';
import {
  callJev,
  estimateCostUsd,
  resolveProvider,
  validateChoice,
  type ChoiceAnswer,
  type NoulAnswer,
} from './jev-client';

interface FieldResult {
  id: string;
  label: string;
  name?: string;
  expected: string;
  got: string;
  correct: boolean;
  confidence: number;
  top: [string, number][];
  invalid: string | null;
}

interface FormResult {
  variant: Variant;
  formId: string;
  lang: 'ja' | 'en';
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  fields: FieldResult[];
  guards: { is_payment: number; is_login: number };
  /** ガードレールが期待通りか（閾値 GUARD_THRESHOLD） */
  guardsOk: boolean;
  model: string;
}

const GUARD_THRESHOLD = 0.5;

const RESULTS_DIR = join(import.meta.dirname, 'results');
const THRESHOLDS = [0.3, 0.5, 0.7];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const variants = (get('--variants')?.split(',') as Variant[] | undefined) ?? VARIANTS;
  const formIds = get('--forms')?.split(',');
  const repeat = Number(get('--repeat') ?? 1);
  const dump = args.includes('--dump');
  return { variants, formIds, repeat, dump };
}

function pct(n: number, d: number) {
  return d === 0 ? '  -  ' : `${((n / d) * 100).toFixed(0).padStart(3)}%`;
}

async function runForm(form: FormFixture, variant: Variant): Promise<FormResult> {
  const req = buildRequest(form, variant);
  const { response, latencyMs } = await callJev(req);

  const fields: FieldResult[] = form.fields.map((f, i) => {
    const key = `f${i}`;
    const answer = response.answers[key] as ChoiceAnswer | undefined;
    const criteria = (req.questions[key] as { criteria: Record<string, unknown> }).criteria;
    if (!answer) {
      return { id: key, label: f.label, name: f.name, expected: f.expected, got: '(missing)', correct: false, confidence: 0, top: [], invalid: '回答なし' };
    }
    const invalid = validateChoice(answer, criteria);
    const top = Object.entries(answer.probabilities ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) as [string, number][];
    return {
      id: key,
      label: f.label,
      name: f.name,
      expected: f.expected,
      got: answer.choice,
      correct: answer.choice === f.expected,
      confidence: answer.confidence,
      top,
      invalid,
    };
  });

  const guard = (k: string) => (response.answers[k] as NoulAnswer | undefined)?.noul ?? -1;
  const guards = { is_payment: guard('is_payment'), is_login: guard('is_login') };
  const guardsOk =
    guards.is_payment >= GUARD_THRESHOLD === Boolean(form.expectPayment) &&
    guards.is_login >= GUARD_THRESHOLD === Boolean(form.expectLogin);

  return {
    variant,
    formId: form.id,
    lang: form.lang,
    latencyMs,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    fields,
    guards,
    guardsOk,
    model: response.model,
  };
}

function printForm(r: FormResult) {
  const ok = r.fields.filter((f) => f.correct).length;
  const avgConf = r.fields.reduce((s, f) => s + f.confidence, 0) / r.fields.length;
  console.log(
    `[${r.variant.padEnd(10)}] ${r.formId.padEnd(16)} ${String(ok).padStart(2)}/${r.fields.length} ${pct(ok, r.fields.length)}` +
      `  conf ${avgConf.toFixed(2)}  ${Math.round(r.latencyMs).toString().padStart(5)}ms  in ${r.inputTokens.toLocaleString().padStart(6)} tok` +
      `  pay ${r.guards.is_payment.toFixed(2)} login ${r.guards.is_login.toFixed(2)} ${r.guardsOk ? '' : '!! guard'}`,
  );
  for (const f of r.fields) {
    if (f.correct && !f.invalid) continue;
    const label = f.label || '(no label)';
    const second = f.top[1] ? `2nd ${f.top[1][0]} ${f.top[1][1].toFixed(2)}` : '';
    console.log(
      `    ${f.correct ? '~' : '✗'} ${f.id.padEnd(3)} ${label.padEnd(18)} ${f.name ? `(${f.name})`.padEnd(20) : ''.padEnd(20)}` +
        ` want ${f.expected.padEnd(18)} got ${f.got.padEnd(18)} ${f.confidence.toFixed(2)}  ${second}${f.invalid ? `  !! ${f.invalid}` : ''}`,
    );
  }
}

function printSummary(results: FormResult[], variants: Variant[]) {
  console.log('\n=== Summary ===');
  console.log(
    'variant     | all        | ja         | en         | ' +
      THRESHOLDS.map((t) => `≥${t} prec/cov`).join(' | ') +
      ' | conf ok/ng  | p50 ms | tokens/form | est $/form | guards',
  );
  for (const v of variants) {
    const rs = results.filter((r) => r.variant === v);
    if (!rs.length) continue;
    const all = rs.flatMap((r) => r.fields);
    const ja = rs.filter((r) => r.lang === 'ja').flatMap((r) => r.fields);
    const en = rs.filter((r) => r.lang === 'en').flatMap((r) => r.fields);
    const acc = (fs: FieldResult[]) => `${String(fs.filter((f) => f.correct).length).padStart(3)}/${String(fs.length).padEnd(3)} ${pct(fs.filter((f) => f.correct).length, fs.length)}`;

    // 閾値でゲートした場合: 採用したもののうち正解の割合（precision）と、採用できた割合（coverage）
    const gated = THRESHOLDS.map((t) => {
      const accepted = all.filter((f) => f.confidence >= t);
      const prec = accepted.filter((f) => f.correct).length;
      return `${pct(prec, accepted.length)}/${pct(accepted.length, all.length)}`;
    });

    const confOk = all.filter((f) => f.correct).map((f) => f.confidence);
    const confNg = all.filter((f) => !f.correct).map((f) => f.confidence);
    const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : ' -  ');
    const lat = rs.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = lat[Math.floor(lat.length / 2)];
    const tokPerForm = rs.reduce((s, r) => s + r.inputTokens, 0) / rs.length;

    const guardOk = rs.filter((r) => r.guardsOk).length;

    console.log(
      `${v.padEnd(11)} | ${acc(all)} | ${acc(ja)} | ${acc(en)} | ${gated.join(' | ')} | ${mean(confOk)} / ${mean(confNg)} | ${Math.round(p50).toString().padStart(6)} | ${Math.round(tokPerForm).toLocaleString().padStart(11)} | ${estimateCostUsd(tokPerForm).toFixed(5)} | guards ${guardOk}/${rs.length}`,
    );
  }

  // 間違いの傾向（期待 → 実際）を集計
  const confusion = new Map<string, number>();
  for (const f of results.flatMap((r) => r.fields).filter((f) => !f.correct)) {
    const k = `${f.expected} → ${f.got}`;
    confusion.set(k, (confusion.get(k) ?? 0) + 1);
  }
  if (confusion.size) {
    console.log('\n=== Confusions (expected → got) ===');
    [...confusion.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${String(n).padStart(2)}  ${k}`));
  }
}

async function main() {
  const { variants, formIds, repeat, dump } = parseArgs();
  const forms = formIds ? FORMS.filter((f) => formIds.includes(f.id)) : FORMS;
  if (!forms.length) throw new Error(`該当フォームなし: ${formIds}`);
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (dump) {
    for (const v of variants) {
      for (const f of forms) {
        const path = join(RESULTS_DIR, `request-${v}-${f.id}.json`);
        writeFileSync(path, JSON.stringify(buildRequest(f, v), null, 2));
        console.log(`wrote ${path}`);
      }
    }
    return;
  }

  const cfg = resolveProvider();
  console.log(`provider: ${cfg.provider}  url: ${cfg.url}  model: ${cfg.model}`);
  console.log(`forms: ${forms.map((f) => f.id).join(', ')}  variants: ${variants.join(', ')}  repeat: ${repeat}\n`);

  const results: FormResult[] = [];
  for (const v of variants) {
    for (const f of forms) {
      for (let n = 0; n < repeat; n++) {
        try {
          const r = await runForm(f, v);
          results.push(r);
          printForm(r);
        } catch (e) {
          console.error(`[${v}] ${f.id} FAILED:`, e instanceof Error ? e.message : e);
        }
      }
    }
    console.log('');
  }

  printSummary(results, variants);

  const out = join(RESULTS_DIR, `run-${stamp}.json`);
  writeFileSync(out, JSON.stringify({ provider: cfg.provider, model: cfg.model, results }, null, 2));
  console.log(`\nsaved: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
