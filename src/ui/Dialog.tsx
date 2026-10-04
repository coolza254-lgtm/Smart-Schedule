import { create } from 'zustand';
import { useT } from '../i18n';

// In-app replacement for window.confirm / window.alert, which some hosts
// (such as embedded previews) silently block.

interface DialogState {
  message: string | null;
  danger: boolean;
  alertOnly: boolean;
  resolve: ((ok: boolean) => void) | null;
}

const useDialog = create<DialogState>(() => ({ message: null, danger: false, alertOnly: false, resolve: null }));

export function confirmDialog(message: string, opts: { danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.setState({ message, danger: !!opts.danger, alertOnly: false, resolve });
  });
}

export function alertDialog(message: string): Promise<void> {
  return new Promise((resolve) => {
    useDialog.setState({ message, danger: false, alertOnly: true, resolve: () => resolve() });
  });
}

export function DialogHost() {
  const t = useT();
  const { message, danger, alertOnly, resolve } = useDialog();
  if (message === null) return null;
  const close = (ok: boolean) => {
    useDialog.setState({ message: null, resolve: null });
    resolve?.(ok);
  };
  return (
    <div className="modal-back center" onClick={() => close(false)}>
      <div className="sheet-modal dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-msg">{message}</p>
        <div className="modal-actions">
          {alertOnly ? null : (
            <button className="btn" onClick={() => close(false)}>
              {t.cancel}
            </button>
          )}
          <button className={`btn ${danger ? 'danger-solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
            {alertOnly ? t.close_ : t.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
