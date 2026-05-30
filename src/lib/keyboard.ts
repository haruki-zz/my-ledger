import { InteractionManager, Keyboard } from 'react-native';

type DismissKeyboardOptions = {
  delayMs?: number;
};

export function runAfterKeyboardDismiss(
  fn: () => void | Promise<void>,
  options: DismissKeyboardOptions = {}
) {
  if (!Keyboard.isVisible()) {
    void fn();
    return;
  }

  Keyboard.dismiss();

  const runAction = () => {
    if (options.delayMs && options.delayMs > 0) {
      // Dropdowns need one short extra beat after keyboard dismissal so their layout opens against
      // the settled viewport instead of the shrinking keyboard viewport.
      setTimeout(() => {
        void fn();
      }, options.delayMs);
      return;
    }

    void fn();
  };

  InteractionManager.runAfterInteractions(runAction);
}
