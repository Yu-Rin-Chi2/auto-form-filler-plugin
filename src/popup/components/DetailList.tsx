import type { FieldOutcome } from '../../shared/types';
import type { MessageKey } from '../../shared/i18n';

type Props = {
  details: FieldOutcome[];
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

/** フィールドごとの結果一覧。値そのものは表示しない（肩越しの覗き見対策、要件 03-uiux 3.2） */
export const DetailList = ({ details, t }: Props) => {
  if (details.length === 0) {
    return <p className="hint">{t('popup.detailEmpty')}</p>;
  }
  return (
    <ul className="detail-list" aria-label={t('popup.detailButton')}>
      {details.map((d) => (
        <li key={d.fieldId} className="detail-list__item">
          <span className="detail-list__label">{d.label || d.fieldId}</span>
          <span className="detail-list__status">
            {d.choice && d.choice !== 'none' ? d.choice : t('popup.detailNoChoice')} ·{' '}
            {t(`outcome.${d.reason}` as MessageKey)}
          </span>
        </li>
      ))}
    </ul>
  );
};
