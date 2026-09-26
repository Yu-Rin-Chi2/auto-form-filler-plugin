import type { ReactNode } from 'react';
import type { MessageKey } from '../../shared/i18n';
import { createCustomField, PRESET_COLORS } from '../../shared/profile-schema';
import { SNS_FIELD_KEYS } from '../../shared/types';
import type { AccountType, CustomField, Gender, Profile, ProfileFields } from '../../shared/types';
import {
  AtSignIcon,
  BankIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  InfoIcon,
  MailIcon,
  MapPinIcon,
  PuzzleIcon,
  UserIcon,
  XIcon,
} from '../../shared/ui/icons';
import { ProfileAvatar } from '../../shared/ui/ProfileAvatar';

type Props = {
  draft: Profile;
  onChange: (next: Profile) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const NAME_FIELDS: (keyof ProfileFields)[] = [
  'family_name',
  'given_name',
  'family_name_kana',
  'given_name_kana',
  'family_name_romaji',
  'given_name_romaji',
];
const ADDRESS_FIELDS: (keyof ProfileFields)[] = [
  'postal_code',
  'prefecture',
  'city',
  'address_line1',
  'address_line2',
  'country',
];
/** 住所のカナ（金融・決済系フォーム向け）。都道府県のカナは prefecture から自動生成するため入力欄は持たない */
const ADDRESS_KANA_FIELDS: (keyof ProfileFields)[] = ['city_kana', 'address_line1_kana', 'address_line2_kana'];
const AFFILIATION_FIELDS: (keyof ProfileFields)[] = ['company', 'department', 'website'];
const GENDER_OPTIONS: Gender[] = ['male', 'female', 'other', 'no_answer'];
/** 銀行口座（口座名義は氏名・フリガナから自動生成するため入力欄を持たない） */
const BANK_FIELDS: (keyof ProfileFields)[] = ['bank_name', 'bank_code', 'branch_name', 'branch_code', 'account_number'];
const ACCOUNT_TYPE_OPTIONS: Exclude<AccountType, ''>[] = ['ordinary', 'current', 'savings'];

function countFilled(fields: ProfileFields, keys: readonly (keyof ProfileFields)[]): number {
  return keys.filter((k) => String(fields[k] ?? '').trim() !== '').length;
}

/** 見出し（アイコン + 名前 + 入力済み件数）付きのセクションカード */
function Section({
  icon,
  title,
  filled,
  total,
  children,
}: {
  icon: ReactNode;
  title: string;
  filled?: number;
  total?: number;
  children: ReactNode;
}) {
  const complete = total !== undefined && filled === total;
  return (
    <section className="card form-section">
      <header className="form-section__header">
        <span className="form-section__icon">{icon}</span>
        <h3 className="section-title">{title}</h3>
        {total !== undefined && (
          <span className={`count-badge ${complete ? 'count-badge--complete' : ''}`} aria-hidden="true">
            {complete && <CheckIcon size={11} strokeWidth={3} />}
            {filled}/{total}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/** ラジオボタンをピル型の選択肢として並べる（input はネイティブのまま） */
function ChoiceGroup<V extends string>({
  name,
  label,
  options,
  value,
  optionLabel,
  onSelect,
}: {
  name: string;
  label: string;
  options: V[];
  value: string;
  optionLabel: (v: V) => string;
  onSelect: (v: V) => void;
}) {
  return (
    <div className="form-field">
      <span className="form-field__label">{label}</span>
      <div role="radiogroup" aria-label={label} className="choice-group">
        {options.map((o) => (
          <label key={o} className="choice">
            <input type="radio" name={name} checked={value === o} onChange={() => onSelect(o)} />
            {optionLabel(o)}
          </label>
        ))}
      </div>
    </div>
  );
}

function TextField({
  fieldKey,
  draft,
  onChange,
  t,
}: {
  fieldKey: keyof ProfileFields;
  draft: Profile;
  onChange: (next: Profile) => void;
  t: Props['t'];
}) {
  const isPhone = fieldKey === 'phone';
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={`field-${fieldKey}`}>
        {t(`options.profiles.field.${fieldKey}` as MessageKey)}
      </label>
      <input
        id={`field-${fieldKey}`}
        className="text-input"
        type="text"
        value={draft.fields[fieldKey]}
        onChange={(e) =>
          onChange({ ...draft, fields: { ...draft.fields, [fieldKey]: e.target.value } })
        }
      />
      {isPhone && <span className="form-field__hint">{t('options.profiles.field.phoneHint')}</span>}
    </div>
  );
}

/** ユーザー定義項目の 1 行（表示名・説明・値・削除）。表示名と説明は Jev に送られ、値は送られない */
function CustomFieldRow({
  field,
  onChange,
  onRemove,
  t,
}: {
  field: CustomField;
  onChange: (next: CustomField) => void;
  onRemove: () => void;
  t: Props['t'];
}) {
  return (
    <div className="form-row custom-field-row" data-testid="custom-field-row">
      <div className="form-field">
        <label className="form-field__label" htmlFor={`${field.id}-label`}>
          {t('options.profiles.custom.label')}
        </label>
        <input
          id={`${field.id}-label`}
          className="text-input"
          type="text"
          placeholder={t('options.profiles.custom.labelPlaceholder')}
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={`${field.id}-description`}>
          {t('options.profiles.custom.description')}
        </label>
        <input
          id={`${field.id}-description`}
          className="text-input"
          type="text"
          placeholder={t('options.profiles.custom.descriptionPlaceholder')}
          value={field.description}
          onChange={(e) => onChange({ ...field, description: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={`${field.id}-value`}>
          {t('options.profiles.custom.value')}
        </label>
        <input
          id={`${field.id}-value`}
          className="text-input"
          type="text"
          value={field.value}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
        />
      </div>
      <div className="form-field custom-field-row__remove">
        <button type="button" className="button button--ghost button--small" onClick={onRemove}>
          <XIcon size={14} />
          {t('options.profiles.custom.remove')}
        </button>
      </div>
    </div>
  );
}

export const ProfileForm = ({ draft, onChange, t }: Props) => {
  const customFields = draft.customFields ?? [];
  const setCustomFields = (next: CustomField[]) => onChange({ ...draft, customFields: next });
  const setField = <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) =>
    onChange({ ...draft, fields: { ...draft.fields, [key]: value } });
  const f = draft.fields;

  return (
    <div className="profile-form">
      <div className="card profile-hero">
        <ProfileAvatar name={draft.name} color={draft.color} size={56} />
        <div className="profile-hero__fields">
          <div className="form-field">
            <label className="form-field__label" htmlFor="profile-name">
              {t('options.profiles.nameLabel')}
            </label>
            <input
              id="profile-name"
              className="text-input text-input--large"
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="form-field">
            <span className="form-field__label">{t('options.profiles.colorLabel')}</span>
            <div className="color-picker" role="radiogroup" aria-label={t('options.profiles.colorLabel')}>
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === color}
                  aria-label={color}
                  className={`color-swatch ${draft.color === color ? 'color-swatch--selected' : ''}`}
                  style={{ background: color, color }}
                  onClick={() => onChange({ ...draft, color })}
                >
                  {draft.color === color && <CheckIcon size={13} strokeWidth={3.2} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="callout callout--inline">
        <InfoIcon size={15} />
        {t('options.profiles.hint')}
      </p>

      <Section
        icon={<UserIcon size={16} />}
        title={t('options.profiles.section.name')}
        filled={countFilled(f, NAME_FIELDS)}
        total={NAME_FIELDS.length}
      >
        <div className="form-row">
          {NAME_FIELDS.map((k) => (
            <TextField key={k} fieldKey={k} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </Section>

      <Section
        icon={<MailIcon size={16} />}
        title={t('options.profiles.section.contact')}
        filled={countFilled(f, ['email', 'phone'])}
        total={2}
      >
        <div className="form-row">
          <TextField fieldKey="email" draft={draft} onChange={onChange} t={t} />
          <TextField fieldKey="phone" draft={draft} onChange={onChange} t={t} />
        </div>
      </Section>

      <Section
        icon={<MapPinIcon size={16} />}
        title={t('options.profiles.section.address')}
        filled={countFilled(f, ADDRESS_FIELDS)}
        total={ADDRESS_FIELDS.length}
      >
        <div className="form-row">
          {ADDRESS_FIELDS.map((k) => (
            <TextField key={k} fieldKey={k} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
        <div className="subsection">
          <p className="hint">{t('options.profiles.addressKanaHint')}</p>
          <div className="form-row">
            {ADDRESS_KANA_FIELDS.map((k) => (
              <TextField key={k} fieldKey={k} draft={draft} onChange={onChange} t={t} />
            ))}
          </div>
        </div>
      </Section>

      <Section
        icon={<BuildingIcon size={16} />}
        title={t('options.profiles.section.affiliation')}
        filled={countFilled(f, AFFILIATION_FIELDS)}
        total={AFFILIATION_FIELDS.length}
      >
        <div className="form-row">
          {AFFILIATION_FIELDS.map((k) => (
            <TextField key={k} fieldKey={k} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </Section>

      <Section
        icon={<CalendarIcon size={16} />}
        title={t('options.profiles.section.other')}
        filled={countFilled(f, ['birth_date', 'gender'])}
        total={2}
      >
        <div className="form-row">
          <div className="form-field">
            <label className="form-field__label" htmlFor="field-birth_date">
              {t('options.profiles.field.birth_date')}
            </label>
            <input
              id="field-birth_date"
              className="text-input"
              type="date"
              value={f.birth_date}
              onChange={(e) => setField('birth_date', e.target.value)}
            />
          </div>
          <ChoiceGroup
            name="gender"
            label={t('options.profiles.field.gender')}
            options={GENDER_OPTIONS}
            value={f.gender}
            optionLabel={(g) => t(`options.profiles.gender.${g}` as MessageKey)}
            onSelect={(g) => setField('gender', g)}
          />
        </div>
      </Section>

      <Section
        icon={<BankIcon size={16} />}
        title={t('options.profiles.section.bank')}
        filled={countFilled(f, [...BANK_FIELDS, 'account_type'])}
        total={BANK_FIELDS.length + 1}
      >
        <p className="hint">{t('options.profiles.bankHint')}</p>
        <div className="form-row">
          {BANK_FIELDS.map((k) => (
            <TextField key={k} fieldKey={k} draft={draft} onChange={onChange} t={t} />
          ))}
          <ChoiceGroup
            name="account_type"
            label={t('options.profiles.field.account_type')}
            options={ACCOUNT_TYPE_OPTIONS}
            value={f.account_type}
            optionLabel={(a) => t(`options.profiles.accountType.${a}` as MessageKey)}
            onSelect={(a) => setField('account_type', a)}
          />
        </div>
      </Section>

      <Section
        icon={<AtSignIcon size={16} />}
        title={t('options.profiles.section.sns')}
        filled={countFilled(f, SNS_FIELD_KEYS)}
        total={SNS_FIELD_KEYS.length}
      >
        <p className="hint">{t('options.profiles.snsHint')}</p>
        <div className="form-row">
          {SNS_FIELD_KEYS.map((k) => (
            <TextField key={k} fieldKey={k} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </Section>

      <Section icon={<PuzzleIcon size={16} />} title={t('options.profiles.section.custom')}>
        <p className="hint">{t('options.profiles.customHint')}</p>
        {customFields.map((c, i) => (
          <CustomFieldRow
            key={c.id}
            field={c}
            t={t}
            onChange={(next) => setCustomFields(customFields.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setCustomFields(customFields.filter((_, j) => j !== i))}
          />
        ))}
        <button
          type="button"
          className="add-button add-button--inline"
          onClick={() => setCustomFields([...customFields, createCustomField()])}
        >
          {t('options.profiles.custom.add')}
        </button>
      </Section>
    </div>
  );
};
