import type { FieldOutcome, FieldOutcomeReason } from '../../shared/types';
import type { MessageKey } from '../../shared/i18n';

type Props = {
  details: FieldOutcome[];
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

/** 状態ドットの色分け。色だけに頼らず、隣に状態の文言も必ず出す */
function dotModifier(reason: FieldOutcomeReason): string {
  if (reason === 'filled') return 'detail-list__dot--filled';
  if (reason === 'skipped_low_confidence') return 'detail-list__dot--low';
  if (reason === 'no_match') return '';
  return 'detail-list__dot--skipped';
}

/** フィールドごとの結果一覧。値そのものは表示しない（肩越しの覗き見対策、要件 03-uiux 3.2） */
export const DetailList = ({ details, t }: Props) => {
  if (details.length === 0) {
    return <p className="hint">{t('popup.detailEmpty')}</p>;
  }
  return (
    <ul className="detail-list" aria-label={t('popup.detailButton')}>
      {details.map((d) => (
        <li key={d.fieldId} className="detail-list__item">
          <span className={`detail-list__dot ${dotModifier(d.reason)}`} aria-hidden="true" />
          <span className="detail-list__label">{d.label || d.fieldId}</span>
          <span className="detail-list__status">
            {d.choice && d.choice !== 'none' ? (d.choiceLabel ?? d.choice) : t('popup.detailNoChoice')} ·{' '}
            {t(`outcome.${d.reason}` as MessageKey)}
          </span>
        </li>
      ))}
    </ul>
  );
};
