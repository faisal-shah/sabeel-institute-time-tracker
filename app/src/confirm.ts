// Native side of the confirm seam (web sibling: confirm.web.ts).
import { Alert } from 'react-native';

/** OK/Cancel confirmation; resolves true when the user confirms. */
export function confirmAction(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
