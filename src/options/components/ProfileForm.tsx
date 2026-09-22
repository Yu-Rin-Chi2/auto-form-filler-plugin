import type { MessageKey } from '../../shared/i18n';
import { createCustomField, PRESET_COLORS } from '../../shared/profile-schema';
import { SNS_FIELD_KEYS } from '../../shared/types';
import type { AccountType, CustomField, Gender, Profile, ProfileFields } from '../../shared/types';

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
      <div className="form-field" style={{ alignSelf: 'flex-end', flex: '0 0 auto' }}>
        <button type="button" className="button button--secondary button--small" onClick={onRemove}>
          {t('options.profiles.custom.remove')}
        </button>
      </div>
    </div>
  );
}

export const ProfileForm = ({ draft, onChange, t }: Props) => {
  const customFields = draft.customFields ?? [];
  const setCustomFields = (next: CustomField[]) => onChange({ ...draft, customFields: next });

  return (
    <div className="profile-form">
      <div className="card">
        <div className="form-row">
          <div className="form-field">
            <label className="form-field__label" htmlFor="profile-name">
              {t('options.profiles.nameLabel')}
            </label>
            <input
              id="profile-name"
              className="text-input"
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
                  style={{ background: color }}
                  onClick={() => onChange({ ...draft, color })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="hint">{t('options.profiles.hint')}</p>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.name')}</h3>
        <div className="form-row">
          {NAME_FIELDS.map((f) => (
            <TextField key={f} fieldKey={f} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.contact')}</h3>
        <div className="form-row">
          <TextField fieldKey="email" draft={draft} onChange={onChange} t={t} />
          <TextField fieldKey="phone" draft={draft} onChange={onChange} t={t} />
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.address')}</h3>
        <div className="form-row">
          {ADDRESS_FIELDS.map((f) => (
            <TextField key={f} fieldKey={f} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
        <p className="hint">{t('options.profiles.addressKanaHint')}</p>
        <div className="form-row">
          {ADDRESS_KANA_FIELDS.map((f) => (
            <TextField key={f} fieldKey={f} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.affiliation')}</h3>
        <div className="form-row">
          {AFFILIATION_FIELDS.map((f) => (
            <TextField key={f} fieldKey={f} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.other')}</h3>
        <div className="form-row">
          <div className="form-field">
            <label className="form-field__label" htmlFor="field-birth_date">
              {t('options.profiles.field.birth_date')}
            </label>
            <input
              id="field-birth_date"
              className="text-input"
              type="date"
              value={draft.fields.birth_date}
              onChange={(e) => onChange({ ...draft, fields: { ...draft.fields, birth_date: e.target.value } })}
            />
          </div>
          <div className="form-field">
            <span className="form-field__label">{t('options.profiles.field.gender')}</span>
            <div role="radiogroup" aria-label={t('options.profiles.field.gender')} style={{ display: 'flex', gap: 12 }}>
              {GENDER_OPTIONS.map((g) => (
                <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input
                    type="radio"
                    name="gender"
                    checked={draft.fields.gender === g}
                    onChange={() => onChange({ ...draft, fields: { ...draft.fields, gender: g } })}
                  />
                  {t(`options.profiles.gender.${g}` as MessageKey)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.bank')}</h3>
        <p className="hint">{t('options.profiles.bankHint')}</p>
        <div className="form-row">
          {BANK_FIELDS.map((f) => (
            <TextField key={f} fieldKey={f} draft={draft} onChange={onChange} t={t} />
          ))}
          <div className="form-field">
            <span className="form-field__label">{t('options.profiles.field.account_type')}</span>
            <div
              role="radiogroup"
              aria-label={t('options.profiles.field.account_type')}
              style={{ display: 'flex', gap: 12 }}
            >
              {ACCOUNT_TYPE_OPTIONS.map((a) => (
                <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input
                    type="radio"
                    name="account_type"
                    checked={draft.fields.account_type === a}
                    onChange={() => onChange({ ...draft, fields: { ...draft.fields, account_type: a } })}
                  />
                  {t(`options.profiles.accountType.${a}` as MessageKey)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.sns')}</h3>
        <p className="hint">{t('options.profiles.snsHint')}</p>
        <div className="form-row">
          {SNS_FIELD_KEYS.map((f) => (
            <TextField key={f} fieldKey={f} draft={draft} onChange={onChange} t={t} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">{t('options.profiles.section.custom')}</h3>
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
        <div className="button-row" style={{ justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setCustomFields([...customFields, createCustomField()])}
          >
            {t('options.profiles.custom.add')}
          </button>
        </div>
      </div>
    </div>
  );
};
