/**
 * 受信した JSON を、Jev に渡してよい形だけに絞り込む。
 *
 * **要件 P1 の第 2 層。** 拡張側は個人情報の値を送らない設計だが、ここでも通すキーを
 * 明示的に列挙し、それ以外は落とす。将来拡張側に不具合が入って余計なプロパティが
 * 混ざっても、Jev には届かない。
 */
import type { JevCustomField, JevField, JevFields, JevPageInfo } from './types';

const MAX_TEXT = 300;
const MAX_OPTIONS = 20;
const MAX_CUSTOM_FIELDS = 50;
const CUSTOM_ID_PATTERN = /^custom_[A-Za-z0-9]{1,16}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = MAX_TEXT): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;
}

function sanitizeField(raw: unknown): JevField | null {
  if (!isPlainObject(raw)) return null;
  const tag = text(raw.tag, 16);
  if (!tag) return null;

  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === 'string').slice(0, MAX_OPTIONS).map((o) => o.slice(0, MAX_TEXT))
    : undefined;

  return {
    tag,
    type: text(raw.type, 32),
    name: text(raw.name),
    id: text(raw.id),
    autocomplete: text(raw.autocomplete, 64),
    label: text(raw.label) ?? '',
    placeholder: text(raw.placeholder),
    required: typeof raw.required === 'boolean' ? raw.required : undefined,
    maxlength: typeof raw.maxlength === 'number' && Number.isFinite(raw.maxlength) ? raw.maxlength : undefined,
    section: text(raw.section),
    options,
    // 値そのものではなく「空か埋まっているか」だけを受け付ける
    currentValue: raw.currentValue === 'empty' || raw.currentValue === 'filled' ? raw.currentValue : undefined,
  };
}

export function sanitizeFields(raw: unknown): JevFields | null {
  if (!isPlainObject(raw)) return null;
  const out: JevFields = {};
  for (const [id, value] of Object.entries(raw)) {
    const field = sanitizeField(value);
    if (field) out[id.slice(0, 64)] = field;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** `value` は列挙していないため、送られてきても落ちる */
export function sanitizeCustomFields(raw: unknown): JevCustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: JevCustomField[] = [];
  for (const item of raw.slice(0, MAX_CUSTOM_FIELDS)) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === 'string' && CUSTOM_ID_PATTERN.test(item.id) ? item.id : null;
    const label = text(item.label, 100);
    if (!id || !label) continue;
    out.push({ id, label, description: text(item.description) });
  }
  return out;
}

export function sanitizePage(raw: unknown): JevPageInfo {
  if (!isPlainObject(raw)) return { url: '', title: '', lang: '' };
  return {
    url: text(raw.url, 2048) ?? '',
    title: text(raw.title) ?? '',
    lang: text(raw.lang, 16) ?? '',
  };
}
