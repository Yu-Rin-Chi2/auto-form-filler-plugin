/**
 * フィールド抽出（要件 5.1）。DOM を読むだけで、値の注入は行わない。
 */
import { MAX_FIELDS } from '../shared/constants';
import type { ExtractedField, ExtractedFields, ExtractionResult, PageInfo } from '../shared/types';
import { normalizePageUrl } from '../shared/url';
import { resolveLabel } from './label';

export { MAX_FIELDS };

const CANDIDATE_SELECTOR = 'input, select, textarea, [contenteditable="true"]';
const STRUCTURALLY_EXCLUDED_TYPES = new Set(['file', 'hidden', 'submit', 'button', 'image', 'reset']);
const CARD_LABEL_PATTERN = /カード番号|card ?number|cvv|cvc|セキュリティコード|有効期限/i;

/** fieldId → 実 DOM 要素（radio グループは複数要素の配列）。EXTRACT_FIELDS のたびに作り直す */
let elementRegistry = new Map<string, HTMLElement | HTMLElement[]>();
/** fieldId → 直近の抽出メタデータ（注入時に select/radio の options を参照するため保持） */
let fieldsCache: ExtractedFields = {};

export function getRegisteredElement(id: string): HTMLElement | HTMLElement[] | undefined {
  return elementRegistry.get(id);
}

export function getExtractedField(id: string): ExtractedField | undefined {
  return fieldsCache[id];
}

function hasAriaHiddenAncestor(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.getAttribute('aria-hidden') === 'true') return true;
    node = node.parentElement;
  }
  return false;
}

function hasHiddenStyle(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return true;
  try {
    const computed = el.ownerDocument.defaultView?.getComputedStyle(el);
    if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return true;
  } catch {
    // getComputedStyle が使えない環境では無視する
  }
  return false;
}

function isVisible(el: HTMLElement): boolean {
  if (hasAriaHiddenAncestor(el)) return false;
  if (hasHiddenStyle(el)) return false;
  const withCheckVisibility = el as HTMLElement & { checkVisibility?: () => boolean };
  if (typeof withCheckVisibility.checkVisibility === 'function') {
    try {
      if (!withCheckVisibility.checkVisibility()) return false;
    } catch {
      // ブラウザ差異は無視する（jsdom 等では未実装）
    }
  }
  return true;
}

function isInsideForm(el: HTMLElement): boolean {
  return el.closest('form') !== null;
}

function readMaxLength(el: HTMLElement): number | undefined {
  const attr = el.getAttribute('maxlength');
  if (attr === null) return undefined;
  const n = Number(attr);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function readSelectOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .map((o) => o.textContent?.trim() || o.value)
    .filter((s): s is string => Boolean(s));
}

function readCurrentValueState(
  el: HTMLElement,
  tag: 'input' | 'select' | 'textarea',
  isContentEditable: boolean,
): 'empty' | 'filled' {
  if (isContentEditable) {
    return (el.textContent?.trim() ?? '').length > 0 ? 'filled' : 'empty';
  }
  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    if (!select.value) return 'empty';
    // ブラウザは <option selected> がなければ先頭の option を自動選択する。
    // 先頭 option が自動選択されているだけ（HTML 上 selected 属性がない）の場合は
    // 「ユーザーが選んだ値」とは区別できないため、未入力（empty）として扱う。
    const selectedOption = select.options[select.selectedIndex];
    const firstOption = select.options[0];
    const isDefaultedToFirstOption = selectedOption === firstOption && !firstOption?.hasAttribute('selected');
    return isDefaultedToFirstOption ? 'empty' : 'filled';
  }
  if (tag === 'input' && (el as HTMLInputElement).type === 'radio') {
    return (el as HTMLInputElement).checked ? 'filled' : 'empty';
  }
  const value = (el as HTMLInputElement | HTMLTextAreaElement).value ?? '';
  return value.trim().length > 0 ? 'filled' : 'empty';
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, legend';

/** 直近の見出し（h1-h6 / legend / th）をテキストとして返す（簡易実装） */
function findSection(el: HTMLElement): string | undefined {
  const tr = el.closest('tr');
  if (tr) {
    const th = tr.querySelector('th');
    const text = th?.textContent?.trim();
    if (text) return text;
  }
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector(':scope > legend');
    const text = legend?.textContent?.trim();
    if (text) return text;
  }
  let node: Element | null = el;
  while (node) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.matches(HEADING_SELECTOR)) {
        const text = sibling.textContent?.trim();
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}

function resolvePageInfo(doc: Document): PageInfo {
  const href = doc.location?.href ?? doc.defaultView?.location.href ?? '';
  return {
    url: normalizePageUrl(href),
    title: doc.title ?? '',
    lang: doc.documentElement.lang || 'ja',
  };
}

export function extractFields(doc: Document = document): ExtractionResult {
  elementRegistry = new Map();
  fieldsCache = {};
  const page = resolvePageInfo(doc);

  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR));
  const fields: ExtractedFields = {};
  let excludedCount = 0;
  let overLimitCount = 0;
  let index = 0;
  const radioGroupIds = new Map<string, string>();

  for (const el of candidates) {
    const tagName = el.tagName.toLowerCase();
    const isContentEditable = el.getAttribute('contenteditable') === 'true';

    let tag: 'input' | 'select' | 'textarea';
    if (isContentEditable) tag = 'textarea';
    else if (tagName === 'select') tag = 'select';
    else if (tagName === 'textarea') tag = 'textarea';
    else if (tagName === 'input') tag = 'input';
    else continue;

    const inputType = tag === 'input' ? ((el as HTMLInputElement).type || 'text').toLowerCase() : undefined;

    if (tag === 'input' && inputType) {
      if (inputType === 'password') {
        excludedCount++;
        continue;
      }
      // checkbox は MVP では入力対象外（要件 5.4）。抽出段階で除外し Jev にも送らない
      // ことで、60 件枠とトークンを節約する（レビュー指摘 A-4）。resolve.ts 側の
      // isCheckbox による強制 no_match は、万一 checkbox が抽出結果に紛れ込んだ場合の
      // 防御として残している
      if (inputType === 'checkbox') {
        excludedCount++;
        continue;
      }
      if (STRUCTURALLY_EXCLUDED_TYPES.has(inputType)) continue;
    }
    if (el.hasAttribute('readonly') || el.hasAttribute('disabled')) continue;
    if (!isVisible(el)) continue;
    if (tag === 'input' && inputType === 'search' && !isInsideForm(el)) continue;

    const autocomplete = el.getAttribute('autocomplete') ?? undefined;
    if (autocomplete && autocomplete.toLowerCase().startsWith('cc-')) {
      excludedCount++;
      continue;
    }

    const label = resolveLabel(el);
    const name = el.getAttribute('name') ?? undefined;
    if (CARD_LABEL_PATTERN.test(label) || (name && CARD_LABEL_PATTERN.test(name))) {
      excludedCount++;
      continue;
    }

    // radio グループ化（要件 5.1.3）
    if (tag === 'input' && inputType === 'radio' && name) {
      const existingId = radioGroupIds.get(name);
      if (existingId) {
        const existingField = fields[existingId];
        if (existingField) {
          existingField.options = [...(existingField.options ?? []), label];
          if ((el as HTMLInputElement).checked) existingField.currentValue = 'filled';
        }
        const existingEls = elementRegistry.get(existingId);
        if (Array.isArray(existingEls)) existingEls.push(el);
        continue;
      }
    }

    if (index >= MAX_FIELDS) {
      overLimitCount++;
      continue;
    }

    const id = `f${index}`;
    index++;

    const field: ExtractedField = {
      tag,
      type: inputType,
      name,
      id: el.getAttribute('id') ?? undefined,
      autocomplete,
      label,
      placeholder: (el as HTMLInputElement).placeholder || undefined,
      required: el.hasAttribute('required') || undefined,
      maxlength: readMaxLength(el),
      section: findSection(el),
      options:
        tag === 'select'
          ? readSelectOptions(el as HTMLSelectElement)
          : inputType === 'radio'
            ? [label]
            : undefined,
      currentValue: readCurrentValueState(el, tag, isContentEditable),
    };
    fields[id] = field;

    if (tag === 'input' && inputType === 'radio' && name) {
      radioGroupIds.set(name, id);
      elementRegistry.set(id, [el]);
    } else {
      elementRegistry.set(id, el);
    }
  }

  fieldsCache = fields;
  return { fields, page, excludedCount, overLimitCount };
}
