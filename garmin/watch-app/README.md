# Family Care Garmin Watch App

Connect IQ Watch App for Garmin Forerunner 735XT.

## Behavior

- The watch shows a stable pairing code until Android confirms pairing.
- The watch UI has three states: not paired, protected, and fall countdown.
- Magnitude and sample count remain visible in protected mode for sensor checks.
- Fall SOS is locked until `PAIR_CONFIRMED` is received from the Android bridge.
- There is no "send fall test" button in the watch UI.
- When the accelerometer state machine detects a fall, the watch starts a
  countdown. Press Select/Start during the countdown to cancel.
- If countdown expires, the watch sends `FALL_DETECTED` to the Android bridge
  with sensor evidence.
- Demo heart-rate mode uses real accelerometer motion to synthesize a rising
  heart-rate curve. If the watch is paired and the demo heart rate stays high
  long enough, it sends `HEART_RATE_ABNORMAL` with `simulated=true`.
- Connect IQ accelerometer values are milli-G. Around `1000` means roughly
  `1G` at rest.
- `registerSensorDataListener()` uses `:period` in seconds. This app samples 1
  second at 25 Hz before each callback.
- The app tries legacy 735XT sensor options first, then falls back to the newer
  nested accelerometer options used by the simulator/docs.

## Build

From this folder, use the Connect IQ SDK/VS Code Monkey C extension with target
`fr735xt`.

The project entrypoint is:

```text
manifest.xml
source/FamilyCareGarminApp.mc
```

## Android Messages

Android -> Garmin:

```json
{
  "type": "PAIR_CONFIRMED",
  "deviceId": "<backend-wearable-device-id>",
  "memberName": "Optional name"
}
```

Garmin -> Android:

```json
{
  "type": "FALL_DETECTED",
  "deviceIdentifier": "FCG-735XT-8SRERK",
  "magnitude": 31.2,
  "freeFallMs": 180,
  "impactMagnitude": 31.2,
  "stillSeconds": 8,
  "detectedAt": 123456789
}
```

Garmin -> Android heart-rate demo:

```json
{
  "type": "HEART_RATE_ABNORMAL",
  "source": "garmin_fr735xt",
  "simulated": true,
  "simulationReason": "demo_motion_to_heart_rate_curve",
  "heartRate": 154,
  "thresholdHigh": 140,
  "thresholdLow": 45,
  "durationSeconds": 20
}
```

Android must map this to the existing backend wearable endpoint. The watch never
calls Family Care backend directly.
