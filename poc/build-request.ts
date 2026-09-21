import type { FormFixture, FieldFixture } from './fixtures/forms';
import { PROFILE_FIELDS } from './profile-fields';
import type { ChoiceQuestion, JevRequest, NoulQuestion, Question } from './jev-client';

/**
 * 比較するバリアント:
 *   full       : フィールドの全メタデータ + 選択肢に説明文を直接持たせる（基準）
 *   label-only : 日本語ラベルと tag/type だけ（name/autocomplete/placeholder なし = 最悪ケース）
 *   full-ref   : full と同じメタデータだが、説明文は state.profile に 1 回だけ置き、
 *                各質問の criteria は null にしてトークンを節約する
 *   keyed      : full-ref と同じだが fields を配列でなく id をキーにしたオブジェクトにし、
 *                `fields.f12` のように参照する（配列インデックスの数え間違い対策）
 *   inline     : full-ref と同じだが、質問文（instructions オブジェクト）に対象フィールドの
 *                メタデータをそのまま埋め込む。state の fields は周辺文脈として残す
 */
export type Variant = 'full' | 'label-only' | 'full-ref' | 'keyed' | 'inline';
export const VARIANTS: Variant[] = ['full', 'label-only', 'full-ref', 'keyed', 'inline'];

const MAX_OPTIONS = 8;

function serializeField(f: FieldFixture, index: number, variant: Variant) {
  const id = `f${index}`;
  const options = f.options
    ? f.options.length > MAX_OPTIONS
      ? [...f.options.slice(0, MAX_OPTIONS), `…(${f.options.length - MAX_OPTIONS} more)`]
      : f.options
    : undefined;

  if (variant === 'label-only') {
    return { id, ...compact({ tag: f.tag, type: f.type, label: f.label, options }) };
  }
  return {
    id,
    ...compact({
      tag: f.tag,
      type: f.type,
      name: f.name,
      autocomplete: f.autocomplete,
      label: f.label,
      placeholder: f.placeholder,
      required: f.required,
      maxlength: f.maxlength,
      section: f.section,
      options,
    }),
  };
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== '' && v !== false),
  ) as Partial<T>;
}

const NONE_RULE =
  `Pick \`none\` if no entry fits, if the field asks for free-form text, a preference, a date of an event, ` +
  `a consent checkbox, or anything that is not the user's own personal information.`;

const FIELD_INSTRUCTION = (ref: string) =>
  `Which profile entry should be typed or selected into \`${ref}\`? ${NONE_RULE}`;

const USES_PROFILE_REF: Variant[] = ['full-ref', 'keyed', 'inline'];

export function buildRequest(form: FormFixture, variant: Variant): JevRequest {
  const serialized = form.fields.map((f, i) => serializeField(f, i, variant));

  const state: Record<string, unknown> = {
    page: { url: form.url, title: form.title, lang: form.lang },
    fields:
      variant === 'keyed'
        ? Object.fromEntries(serialized.map(({ id, ...rest }) => [id, rest]))
        : serialized,
  };
  if (USES_PROFILE_REF.includes(variant)) state.profile = PROFILE_FIELDS;

  const nullCriteria = () => Object.fromEntries(Object.keys(PROFILE_FIELDS).map((k) => [k, null]));

  const questions: Record<string, Question> = {};
  form.fields.forEach((_, i) => {
    const id = `f${i}`;
    let q: ChoiceQuestion;
    switch (variant) {
      case 'full':
      case 'label-only':
        q = { type: 'choice', instructions: FIELD_INSTRUCTION(`fields[${i}]`), criteria: { ...PROFILE_FIELDS } };
        break;
      case 'full-ref':
        q = {
          type: 'choice',
          instructions: `${FIELD_INSTRUCTION(`fields[${i}]`)} Entry meanings are in \`profile\`.`,
          criteria: nullCriteria(),
        };
        break;
      case 'keyed':
        q = {
          type: 'choice',
          instructions: `${FIELD_INSTRUCTION(`fields.${id}`)} Entry meanings are in \`profile\`.`,
          criteria: nullCriteria(),
        };
        break;
      case 'inline': {
        const { id: _omit, ...target } = serialized[i];
        q = {
          type: 'choice',
          instructions: {
            task: `Which profile entry should be typed or selected into the form field \`target\` below? ${NONE_RULE} ` +
              `Entry meanings are in \`profile\`; \`fields\` in the state shows the surrounding fields for context.`,
            target,
          },
          criteria: nullCriteria(),
        };
        break;
      }
    }
    questions[id] = q;
  });

  // ガードレール。自動入力を止めるべきページかどうかを同じリクエストで聞く
  const guards: Record<string, NoulQuestion> = {
    is_payment: {
      type: 'noul',
      instructions: 'Does `page` or any of `fields` ask for credit card, bank account, or other payment details?',
    },
    is_login: {
      type: 'noul',
      instructions: 'Is `page` a sign-in / login screen for an existing account (not a registration form)?',
    },
  };
  Object.assign(questions, guards);

  return { state, questions };
}
