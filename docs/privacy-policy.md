# Adhan Time Privacy Policy

Effective date: May 5, 2026

Adhan Time stores only the data needed to calculate prayer notifications and keep server-side fallback pushes working.

## Data We Process

- Device push token: `expo_push_token`
- Selected country, district, district name, timezone, locale, notification sound, and enabled prayer preferences
- Server audit logs for notification delivery, including Expo ticket or receipt status
- Local app data saved on the device for the selected location, settings, and cached prayer times

## Why We Process It

We use this data to schedule notifications, send fallback push notifications, prevent duplicate sends, remove invalid push tokens, and debug notification delivery issues.

## Retention

Inactive device records are deleted after 180 days. Push delivery audit logs are retained for 30 days.

## Your Rights

Under KVKK Madde 11 and GDPR Article 13, you may request access, correction, deletion, restriction, objection, and information about how your data is processed.

The Settings screen includes a `Verilerimi sil` action. It removes the device registration from the server when possible, clears local app data, and cancels local prayer notifications.

## Sharing

Push notifications are delivered through Expo push services. Supabase stores the server-side device registration and notification audit records. We do not sell personal data.

## Contact

Use the app store listing or project support channel for privacy and deletion requests.
