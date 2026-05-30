import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

import { KeyboardDoneAccessory } from '@/src/components/KeyboardDoneAccessory';

export function KeyboardAwareScrollView({
  automaticallyAdjustKeyboardInsets,
  keyboardDismissMode,
  keyboardShouldPersistTaps,
  ...props
}: ScrollViewProps) {
  return (
    <>
      <ScrollView
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets ?? Platform.OS === 'ios'}
        keyboardDismissMode={keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag')}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
        {...props}
      />
      <KeyboardDoneAccessory />
    </>
  );
}
