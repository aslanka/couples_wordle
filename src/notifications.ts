import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  if (Platform.OS === 'web') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn('Missing EAS projectId; push registration skipped.');
    return;
  }

  const current = await Notifications.getPermissionsAsync();
  let finalStatus = current.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', user.id);

  if (error) console.warn('Could not save Expo push token:', error.message);
}

export async function sendPairlePush(
  event: 'word_sent' | 'puzzle_finished' | 'day_completed' | 'hint_requested' | 'hint_sent',
  details: { solved?: boolean; guessCount?: number; hint?: string } = {},
) {
  const { error } = await supabase.functions.invoke('send-pairle-push', {
    body: { event, ...details },
  });

  if (error) {
    console.warn('Could not send Pairle push:', error.message);
    throw error;
  }
}

let lastHandledNotificationId: string | null = null;

async function handleNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;

  const notificationId = response.notification.request.identifier;
  if (notificationId === lastHandledNotificationId) return;
  lastHandledNotificationId = notificationId;

  const data = response.notification.request.content.data as { event?: string; hint?: string };

  if (data.event === 'hint_sent' && data.hint) {
    Alert.alert('Your hint ♡', String(data.hint));
    return;
  }

  if (data.event !== 'hint_requested') return;

  if (Platform.OS !== 'ios') {
    Alert.alert('Hint requested ♡', 'Your partner asked for a hint. Open Pairle on iPhone to reply for now.');
    return;
  }

  Alert.prompt(
    'Give a hint ♡',
    'Your partner is stuck. Send a short hint without giving the word away.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Send hint',
        onPress: async (value?: string) => {
          const hint = (value ?? '').trim();
          if (!hint) return;
          try {
            const { error: saveError } = await supabase.rpc('save_pairle_hint', { hint_value: hint.slice(0, 120) });
            if (saveError) throw saveError;
            await sendPairlePush('hint_sent', { hint: hint.slice(0, 120) });
            Alert.alert('Hint sent ♡');
          } catch (error) {
            Alert.alert('Could not send hint', error instanceof Error ? error.message : 'Try again');
          }
        },
      },
    ],
    'plain-text',
    '',
    'sentences',
  );
}

if (Platform.OS !== 'web') {
  Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response).catch((error) => console.warn('Notification tap failed:', error));
  });

  setTimeout(() => {
    Notifications.getLastNotificationResponseAsync()
      .then(handleNotificationResponse)
      .catch((error) => console.warn('Could not read last notification response:', error));
  }, 750);
}
