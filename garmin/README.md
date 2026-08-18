# Family Care Garmin Integration

This folder contains the Garmin Forerunner 735XT integration plan and Connect IQ
Watch App source.

## Current Target

- Device: Garmin Forerunner 735XT
- Connect IQ SDK: 9.2
- Connect IQ target: `fr735xt`, API 2.4
- App type: Watch App
- Sensor API: `Toybox.Sensor.registerSensorDataListener()`
- Sensor options: legacy `:enableAccelerometer`, `:sampleRate`, `:period`
  first for 735XT hardware, with nested `:accelerometer` fallback for simulator
- Accelerometer units: milli-G (`1000` is roughly `1G`)
- Phone bridge: Garmin Connect Mobile + Connect IQ Android Mobile SDK

## Core Rule

Garmin is only a wearable sensor source. It must not create a Family Care SOS
unless the watch is paired to a Family Care member first.

The authoritative pairing record is the backend `WearableDevice` row:

- `workspaceId`: family id
- `ownerMemberId`: member who wears the Garmin
- `ownerUserId`: user account of that member
- `deviceIdentifier`: stable code shown by the Garmin app
- `pairingStatus`: must be `PAIRED`
- `sosEnabled`: must be true

After pairing, Garmin sensor messages are routed through Android to the existing
wearable event endpoint:

```http
POST /api/v1/families/:familyId/wearables/:deviceId/events
```

The backend decides whether the event creates SOS. Do not add a Garmin-specific
SOS API unless the existing wearable contract becomes insufficient.

## Proposed Subfolders

```text
garmin/
  README.md
  PAIRING_FLOW.md
  watch-app/       # Connect IQ / Monkey C source
  android-bridge/  # Android bridge notes/snippets
```

## MVP Milestones

1. Verify live X/Y/Z and acceleration magnitude on the 735XT.
2. Pair Garmin to a Family Care member on Android.
3. Run the sensor fall detector on the watch only after pairing.
4. Send automatic `FALL_DETECTED` from Garmin to Android after the cancel countdown.
5. Android maps Garmin `FALL_DETECTED` to the backend wearable event endpoint.
6. Backend reuses existing SOS and notification flow.
7. Tune thresholds with real 735XT movement data after transport and pairing are stable.
