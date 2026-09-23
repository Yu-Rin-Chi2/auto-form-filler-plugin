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
/** カード情報・暗証番号（PIN）は観測段階で除外する（P3）。銀行口座（口座番号・支店コード等）は対象 */
const CARD_LABEL_PATTERN = /カード番号|card ?number|cvv|cvc|セキュリティコード|有効期限|暗証番号|暗証|\bpin\b|passcode/i;

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
  const withCheckVisibility = el as HTMLElement & { checkVisibility?: (opts?: { opacityProperty?: boolean }) => boolean };
  if (typeof withCheckVisibility.checkVisibility === 'function') {
    try {
      // opacity: 0 の要素（見た目のカスタム select の裏に隠した <select> など）は
      // ユーザーには見えておらず入力対象でもないため除外する
      if (!withCheckVisibility.checkVisibility({ opacityProperty: true })) return false;
    } catch {
      // ブラウザ差異は無視する（jsdom 等では未実装）
    }
  }
  return true;
}

/**
 * document を再帰的にたどり、条件に一致する要素を DOM 順に集める。
 * `querySelectorAll` は shadow root を貫通しないため、open な shadow root を持つ要素を見つけたら
 * その中も探索する（Web Components ベースのフォーム対応）。closed な shadow root は到達不能。
 */
function collectElements(doc: Document, match: (el: Element) => boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (node: Element) => {
    if (match(node)) out.push(node as HTMLElement);
    const shadow = (node as HTMLElement).shadowRoot;
    if (shadow) for (const child of Array.from(shadow.children)) walk(child);
    for (const child of Array.from(node.children)) walk(child);
  };
  for (const el of Array.from(doc.children)) walk(el);
  return out;
}

/** iframe をこの大きさ未満なら「フォームが入っている可能性が低い」とみなす（トラッキング用の 1×1 等を除外） */
const MIN_FRAME_WIDTH = 200;
const MIN_FRAME_HEIGHT = 150;

/**
 * この document 内で可視かつ別オリジンの iframe のオリジン一覧を返す。
 * 拡張はクロスオリジン iframe の中を（ホスト権限がなければ）読めないため、
 * background 側が権限の有無を判定し、必要ならユーザーに許可を求める材料にする。
 */
function findCrossOriginFrameOrigins(doc: Document): string[] {
  const selfOrigin = doc.location?.origin ?? '';
  const origins = new Set<string>();
  for (const frame of collectElements(doc, (el) => el.tagName.toLowerCase() === 'iframe')) {
    const src = frame.getAttribute('src');
    if (!src) continue;
    let origin: string;
    try {
      const url = new URL(src, doc.baseURI);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      origin = url.origin;
    } catch {
      continue;
    }
    if (!origin || origin === selfOrigin) continue;
    if (!isVisible(frame)) continue;
    const rect = frame.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < MIN_FRAME_WIDTH || rect.height < MIN_FRAME_HEIGHT)) {
      continue;
    }
    origins.add(origin);
  }
  return Array.from(origins);
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

/** 「選択してください」「---」など、未選択を表す案内用の option の表示 */
const PLACEHOLDER_OPTION_PATTERN =
  /^[\s\-－‐―—─ー=＝*＊・.。…]*$|選択して(ください|下さい)|お?選び(ください|下さい)|^[(（【［[]?\s*選択\s*[)）】］\]]?$|please\s+(select|choose)|^(select|choose)\b/i;

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
    const selectedOption = select.options[select.selectedIndex];
    // value があっても、表示が空・案内文の option は未選択とみなす
    // （例: Pardot の都道府県欄は `<option value="2125539" selected="selected"></option>` が先頭にある）
    if (!selectedOption || PLACEHOLDER_OPTION_PATTERN.test(selectedOption.textContent?.trim() ?? '')) return 'empty';
    // ブラウザは <option selected> がなければ先頭の option を自動選択する。
    // 先頭 option が自動選択されているだけ（HTML 上 selected 属性がない）の場合は
    // 「ユーザーが選んだ値」とは区別できないため、未入力（empty）として扱う。
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

/** 要素自身と、さかのぼる祖先の数 */
const MAX_HINT_DEPTH = 3;
const MAX_HINTS = 4;
/** Worker 側（`workers/src/sanitize.ts`）と同じ形式。英字始まりの ASCII 識別子のみ */
const HINT_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;
/** レイアウト・状態・フレームワーク由来で、項目の意味を表さない class の構成語 */
const STRUCTURAL_CLASS_WORDS = new Set([
  'form', 'input', 'field', 'fields', 'control', 'text', 'textarea', 'select', 'label', 'col', 'row',
  'group', 'item', 'box', 'wrap', 'wrapper', 'inner', 'outer', 'container', 'block', 'inline', 'flex',
  'grid', 'required', 'optional', 'error', 'valid', 'invalid', 'active', 'focus', 'disabled', 'clearfix',
  'js', 'is', 'has', 'pd', 'sm', 'md', 'lg', 'xl', 'xs', 'full', 'half', 'width', 'large', 'small',
]);

function isStructuralClass(token: string): boolean {
  if (/\d/.test(token)) return true;
  const words = token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
  return words.every((w) => STRUCTURAL_CLASS_WORDS.has(w));
}

/**
 * 項目の意味を表していそうな class 名（例: `zip` / `state` / `address_one`）を集める。
 * ラベルが入力欄から切り離されたフォーム（Pardot など）で、Jev に渡す手がかりにする。
 * 要素自身から祖先へさかのぼり、意味のある class が見つかった最初の要素のものだけを使う
 * （さらに上の祖先は隣の項目もまとめて包んでいることが多く、手がかりが混ざるため）。
 */
function findHints(el: HTMLElement): string[] | undefined {
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth <= MAX_HINT_DEPTH; depth++) {
    if (depth > 0 && node.tagName === 'FORM') break;
    const tokens = Array.from(node.classList).filter((c) => HINT_TOKEN_PATTERN.test(c) && !isStructuralClass(c));
    if (tokens.length > 0) return Array.from(new Set(tokens)).slice(0, MAX_HINTS);
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

  const candidates = collectElements(doc, (el) => el.matches(CANDIDATE_SELECTOR));
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
      hints: findHints(el),
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
  const win = doc.defaultView;
  const isTopFrame = !win || win === win.top;
  return {
    fields,
    page,
    excludedCount,
    overLimitCount,
    crossOriginFrameOrigins: findCrossOriginFrameOrigins(doc),
    isTopFrame,
  };
}
