import { Platform } from 'react-native';
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
  event: 'word_sent' | 'puzzle_finished' | 'day_completed',
  details: { solved?: boolean; guessCount?: number } = {},
) {
  const { error } = await supabase.functions.invoke('send-pairle-push', {
    body: { event, ...details },
  });

  if (error) console.warn('Could not send Pairle push:', error.message);
}
