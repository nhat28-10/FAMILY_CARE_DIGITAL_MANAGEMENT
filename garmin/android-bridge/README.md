# Family Care Android Garmin Bridge

The Garmin watch app cannot call the Family Care backend directly. Android is
the bridge:

1. Member pairs the watch by entering the Garmin pair code in Family Care.
2. Android calls the existing wearable pairing endpoint and receives `deviceId`.
3. Android sends `PAIR_CONFIRMED` back to the Connect IQ app with `deviceId`.
4. Garmin starts fall detection only after it is paired.
5. Android receives `FALL_DETECTED` from Garmin Connect Mobile and posts it to:

```http
POST /api/v1/families/:familyId/wearables/:deviceId/events
```

Backend payload:

```json
{
  "eventType": "FALL_DETECTED",
  "severity": "HIGH",
  "rawValue": {
    "source": "garmin_fr735xt",
    "magnitude": 31.2,
    "x": 12.1,
    "y": -4.4,
    "z": 28.3,
    "freeFallMs": 1200,
    "impactMagnitude": 31.2,
    "stillSeconds": 8
  }
}
```

Heart-rate demo messages from Garmin must be forwarded as
`HEART_RATE_ABNORMAL` and kept clearly marked as simulated:

```json
{
  "eventType": "HEART_RATE_ABNORMAL",
  "severity": "HIGH",
  "rawValue": {
    "source": "garmin_fr735xt",
    "simulated": true,
    "simulationReason": "demo_motion_to_heart_rate_curve",
    "heartRate": 154,
    "thresholdHigh": 140,
    "thresholdLow": 45,
    "durationSeconds": 20
  }
}
```

Do not add a manual fall-test button in the production watch app. Transport tests
can be done with controlled sensor movement and Android logs.

Important: Android must send a Connect IQ message object/map, not a raw JSON
string. The Monkey C app expects `msg.data` to be a Dictionary with keys such as
`type`, `deviceId`, and `memberName`.
