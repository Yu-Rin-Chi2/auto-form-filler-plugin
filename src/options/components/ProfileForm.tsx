import type { MessageKey } from '../../shared/i18n';
import { PRESET_COLORS } from '../../shared/profile-schema';
import type { Gender, Profile, ProfileFields } from '../../shared/types';

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
const AFFILIATION_FIELDS: (keyof ProfileFields)[] = ['company', 'department'];
const GENDER_OPTIONS: Gender[] = ['male', 'female', 'other', 'no_answer'];

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

export const ProfileForm = ({ draft, onChange, t }: Props) => {
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
    </div>
  );
};
