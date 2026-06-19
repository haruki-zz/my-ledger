import { Ionicons } from '@expo/vector-icons';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, theme } from '@/src/components/styles';

export const KEYBOARD_DONE_ACCESSORY_ID = 'ledgerKeyboardDoneAccessory';

export function KeyboardDoneAccessory() {
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ACCESSORY_ID}>
      <View style={accessoryStyles.toolbar}>
        <Pressable
          accessibilityLabel="Dismiss keyboard"
          accessibilityRole="button"
          onPress={Keyboard.dismiss}
          style={({ pressed }) => [accessoryStyles.button, pressed && accessoryStyles.pressed]}
        >
          <Text style={accessoryStyles.buttonText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export function AndroidKeyboardDoneButton() {
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="Dismiss keyboard"
      accessibilityRole="button"
      onPress={Keyboard.dismiss}
      style={({ pressed }) => [accessoryStyles.androidButton, pressed && accessoryStyles.pressed]}
    >
      <Ionicons color={colors.primaryDark} name="checkmark" size={17} />
      <Text style={accessoryStyles.androidButtonText}>Done</Text>
    </Pressable>
  );
}

const accessoryStyles = StyleSheet.create({
  androidButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.tint,
    borderColor: colors.secondary,
    borderRadius: theme.radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  androidButtonText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600'
  },
  button: {
    borderRadius: theme.radii.compact,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  buttonText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700'
  },
  pressed: {
    opacity: 0.7
  },
  toolbar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 48,
    paddingHorizontal: 12
  }
});
