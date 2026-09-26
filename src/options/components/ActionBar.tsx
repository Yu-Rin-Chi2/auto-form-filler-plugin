import type { ReactNode } from 'react';
import { CheckCircleIcon } from '../../shared/ui/icons';

type Props = {
  /** 保存直後の「保存しました」表示 */
  savedText: string | null;
  /** 未保存の変更がある場合の表示 */
  unsavedText: string | null;
  children: ReactNode;
};

/** 画面下部に張り付く保存バー。保存状態（未保存／保存しました）を左に、操作ボタンを右に置く */
export const ActionBar = ({ savedText, unsavedText, children }: Props) => (
  <div className={`action-bar ${unsavedText ? 'action-bar--dirty' : ''}`}>
    <div className="action-bar__status" aria-live="polite">
      {savedText ? (
        <span className="status-text status-text--success">
          <CheckCircleIcon size={15} />
          {savedText}
        </span>
      ) : unsavedText ? (
        <span className="status-text status-text--dirty">
          <span className="status-dot" aria-hidden="true" />
          {unsavedText}
        </span>
      ) : null}
    </div>
    <div className="action-bar__buttons">{children}</div>
  </div>
);
