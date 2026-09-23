/**
 * フィールドのラベル解決（要件 5.1.1）。
 * 優先順位: aria-labelledby → aria-label → <label for> → 祖先 <label> →
 *           同じ <tr> の <th> / 直前の <dt> → 直前の兄弟テキスト → placeholder → title → name
 */

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

/**
 * id 参照（aria-labelledby / label[for]）を解決するスコープ。
 * shadow DOM 内の要素では `ownerDocument` ではなく所属する shadow root を使う必要がある
 * （id はツリースコープごとに独立しているため）。
 */
function scopeOf(el: HTMLElement): Document | ShadowRoot {
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root : el.ownerDocument;
}

function fromAriaLabelledby(el: HTMLElement): string {
  const attr = el.getAttribute('aria-labelledby');
  if (!attr) return '';
  const ids = attr.split(/\s+/).filter(Boolean);
  const scope = scopeOf(el);
  const text = ids
    .map((id) => textOf(scope.getElementById(id)))
    .filter(Boolean)
    .join(' ');
  return text;
}

function fromLabelFor(el: HTMLElement): string {
  const id = el.getAttribute('id');
  if (!id) return '';
  const labels = Array.from(scopeOf(el).querySelectorAll('label[for]'));
  const match = labels.find((l) => l.getAttribute('for') === id);
  return textOf(match ?? null);
}

function fromAncestorLabel(el: HTMLElement): string {
  const label = el.closest('label');
  if (!label) return '';
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
  return clone.textContent?.trim() ?? '';
}

function fromTableOrDl(el: HTMLElement): string {
  const tr = el.closest('tr');
  if (tr) {
    const th = tr.querySelector('th');
    const text = textOf(th);
    if (text) return text;
  }
  const dd = el.closest('dd');
  if (dd) {
    const prev = dd.previousElementSibling;
    if (prev && prev.tagName === 'DT') {
      const text = textOf(prev);
      if (text) return text;
    }
  }
  return '';
}

function fromPreviousSiblingText(el: HTMLElement): string {
  let node: ChildNode | null = el.previousSibling;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) return text;
      node = node.previousSibling;
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      // 直前が要素の場合、そのテキストはラベルとして使わない
      break;
    }
    node = node.previousSibling;
  }
  return '';
}

/**
 * name 属性は最後の手段。自動採番された ID（例: Pardot の `893021_217038pi_893021_217038`）は
 * 項目の意味を持たず、ラベルとして見せるとかえって Jev を惑わせるので使わない。
 * 英字 3 文字以上の並び（`tel` / `zip` / `last_name` 等）か、非 ASCII 文字を含むものだけ採用する。
 */
function fromMeaningfulName(el: HTMLElement): string {
  const name = el.getAttribute('name')?.trim() ?? '';
  return /[A-Za-z]{3,}|[^\x00-\x7f]/.test(name) ? name : '';
}

export function resolveLabel(el: HTMLElement): string {
  const strategies = [
    () => fromAriaLabelledby(el),
    () => el.getAttribute('aria-label')?.trim() ?? '',
    () => fromLabelFor(el),
    () => fromAncestorLabel(el),
    () => fromTableOrDl(el),
    () => fromPreviousSiblingText(el),
    () => (el as HTMLInputElement).placeholder?.trim() ?? '',
    () => el.getAttribute('title')?.trim() ?? '',
    () => fromMeaningfulName(el),
  ];
  for (const strategy of strategies) {
    const value = strategy();
    if (value) return value;
  }
  return '';
}
