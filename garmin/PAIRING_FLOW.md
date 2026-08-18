# Garmin Pairing Flow

## Why Pairing Is Required

A Garmin event is only trusted after Family Care knows which member owns the
watch. Without pairing, Android may receive a Bluetooth message from Garmin, but
the backend must reject it because it cannot prove which family/member should be
linked to the SOS.

The backend already enforces this in `WearablesService.ingestEvent()`:

- the device must exist inside the family
- the device must be `PAIRED`
- the request user must be the device owner member
- `sosEnabled` and family SOS settings decide whether to create an alert

## MVP Pairing Model

For Garmin 735XT, use a phone-assisted pairing model.

1. Garmin watch app creates or loads a stable local identifier.
   Example: `FCG-735XT-8SRERK`
2. Garmin displays this code on the watch.
3. Family Care Android user opens Profile > Wearables.
4. The member enters the code shown on the watch.
5. Android calls existing backend pairing:

```http
POST /api/v1/families/:familyId/wearables
Authorization: Bearer <member-access-token>
```

```json
{
  "deviceName": "Garmin Forerunner 735XT",
  "deviceType": "SMARTWATCH",
  "deviceIdentifier": "FCG-735XT-8SRERK",
  "gpsEnabled": true,
  "sosEnabled": true
}
```

6. Backend creates `WearableDevice` with `ownerMemberId` equal to the current
   Family Care member.
7. Android stores the backend `deviceId` and associates it with the Garmin
   Connect IQ device/app instance.
8. Future Garmin messages can now be posted to:

```http
POST /api/v1/families/:familyId/wearables/:deviceId/events
```

## Pairing Another Member

Backend supports `ownerMemberId` for managers/deputies pairing a wearable for
another family member:

```json
{
  "deviceName": "Garmin Forerunner 735XT",
  "deviceType": "SMARTWATCH",
  "deviceIdentifier": "FCG-735XT-8SRERK",
  "ownerMemberId": "<target-member-id>",
  "gpsEnabled": true,
  "sosEnabled": true
}
```

Important constraint: the current event ingestion endpoint only allows the
device owner member to send sensor events. So the safest MVP is:

- the Garmin is paired from the phone/account of the member who wears it
- that same Android app receives Garmin messages and posts events

If a caregiver phone must receive events for another member's Garmin, the backend
will need a deliberate service-token or delegated-ingest endpoint. Do not bypass
the current ownership check silently.

## Event Flow After Pairing

```text
Garmin 735XT Watch App
  -> Toybox.Communications transmit message
  -> Garmin Connect Mobile
  -> Family Care Android Garmin bridge
  -> WearableProvider/createEvent or native HTTP
  -> Backend WearablesService.ingestEvent
  -> optional SosService.trigger
  -> existing SOS realtime + FCM notification flow
```

## Fall Event Mapping

The watch app does not expose a manual "send fall test" button. After pairing,
the Garmin app listens to accelerometer samples, detects a fall pattern, starts a
cancel countdown, then sends `FALL_DETECTED` automatically if the countdown
expires.

Garmin -> Android:

```json
{
  "type": "FALL_DETECTED",
  "source": "garmin_fr735xt",
  "deviceIdentifier": "FCG-735XT-8SRERK",
  "deviceId": "<backend-wearable-device-id>",
  "magnitude": 31.2,
  "x": 12.1,
  "y": -4.4,
  "z": 28.3,
  "freeFallMs": 1200,
  "impactMagnitude": 31.2,
  "stillSeconds": 8,
  "detectedAt": 123456789
}
```

Android -> backend:

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

`FALL_DETECTED` creates SOS only when family setting
`autoCreateAlertFromFall=true`. This is intentional: Garmin stays a wearable
sensor source, and the backend remains the authority for SOS creation.
