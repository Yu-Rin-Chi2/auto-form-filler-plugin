import { useEffect, useRef } from 'react';

type Props = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 削除確認ダイアログ。Esc で閉じる（要件テスト E2E-EDGE-13） */
export const ConfirmDialog = ({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
        onClick={(e) => e.stopPropagation()}
      >
        <p>{message}</p>
        <div className="button-row">
          <button type="button" className="button button--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="button button--danger" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
