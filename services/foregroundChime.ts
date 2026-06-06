import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import notificationSound from '../assets/sounds/notification.wav';

// Plays the bundled notification sound IN-APP when a prayer time arrives while
// the app is foregrounded. expo-notifications drops foreground notifications via
// its 3s JS-handler timeout (rules/04), so the foreground cue can't rely on the
// OS notification — useForegroundPrayerAlert owns it and calls this. One lazily
// created player is reused across prayers.
let player: AudioPlayer | null = null;

export async function playForegroundChime(): Promise<void> {
  if (!player) {
    player = createAudioPlayer(notificationSound);
  } else {
    // replace() atomically reloads the source and resets position. Reusing a
    // finished player with seekTo(0) can leave isLoaded flickering on Android so
    // the 2nd+ prayer's play() no-ops (expo/expo#39232) — replace() avoids that.
    player.replace(notificationSound);
  }
  player.play();
}
