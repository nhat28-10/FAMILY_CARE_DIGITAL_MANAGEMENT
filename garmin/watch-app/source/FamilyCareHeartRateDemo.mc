using Toybox.Lang;

class FamilyCareHeartRateDemo {
    const BASE_HR = 82;
    const THRESHOLD_HIGH = 140;
    const THRESHOLD_LOW = 45;
    const TRIGGER_HR = 150;
    const TRIGGER_AFTER_MS = 20000;
    const COOLDOWN_MS = 60000;
    const MOTION_DELTA_MG = 180;
    const HARD_MOTION_MG = 1500;
    const SAMPLE_INTERVAL_MS = 40;

    var heartRate = BASE_HR;
    var status = "HR demo idle";

    private var _motionMs = 0;
    private var _lastMagnitude = null;
    private var _lastTrigger = null;

    function addSample(magnitude, nowMs) {
        var active = isActiveMotion(magnitude);
        if (active) {
            _motionMs += SAMPLE_INTERVAL_MS;
            if (_motionMs > TRIGGER_AFTER_MS) {
                _motionMs = TRIGGER_AFTER_MS;
            }
        } else {
            _motionMs -= SAMPLE_INTERVAL_MS * 2;
            if (_motionMs < 0) {
                _motionMs = 0;
            }
        }

        heartRate = BASE_HR + ((_motionMs * 72) / TRIGGER_AFTER_MS);
        if (heartRate >= THRESHOLD_HIGH) {
            status = "HR demo high";
        } else if (_motionMs > 0) {
            status = "HR demo rising";
        } else {
            status = "HR demo idle";
        }

        _lastMagnitude = magnitude;

        if (heartRate < TRIGGER_HR) {
            return null;
        }
        if (_motionMs < TRIGGER_AFTER_MS) {
            return null;
        }
        if (_lastTrigger != null && nowMs - _lastTrigger < COOLDOWN_MS) {
            return null;
        }

        _lastTrigger = nowMs;
        return {
            "heartRate" => heartRate,
            "thresholdHigh" => THRESHOLD_HIGH,
            "thresholdLow" => THRESHOLD_LOW,
            "durationSeconds" => TRIGGER_AFTER_MS / 1000
        };
    }

    private function isActiveMotion(magnitude) {
        if (magnitude >= HARD_MOTION_MG) {
            return true;
        }
        if (_lastMagnitude == null) {
            return false;
        }

        var delta = magnitude - _lastMagnitude;
        if (delta < 0) {
            delta = -delta;
        }
        return delta >= MOTION_DELTA_MG;
    }
}
