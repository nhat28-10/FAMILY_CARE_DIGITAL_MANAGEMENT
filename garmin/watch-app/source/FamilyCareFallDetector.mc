using Toybox.Lang;

class FamilyCareFallDetector {
    const PHASE_IDLE = 0;
    const PHASE_FREE_FALL = 1;
    const PHASE_AWAIT_IMPACT = 2;
    const PHASE_AWAIT_STILLNESS = 3;

    const FREE_FALL_THRESHOLD_MG = 350;
    const MIN_FREE_FALL_MS = 300;
    const IMPACT_THRESHOLD_MG = 2500;
    const IMPACT_WINDOW_MS = 2000;
    const STILLNESS_DELTA_MG = 250;
    const STILLNESS_MS = 8000;
    const REST_MIN_MG = 700;
    const REST_MAX_MG = 1300;
    const COOLDOWN_MS = 30000;

    private var _phase = PHASE_IDLE;
    private var _freeFallStart = null;
    private var _freeFallEnd = null;
    private var _impactAt = null;
    private var _impactMagnitude = 0.0;
    private var _stillStart = null;
    private var _lastMagnitude = null;
    private var _lastTrigger = null;

    function reset() {
        _phase = PHASE_IDLE;
        _freeFallStart = null;
        _freeFallEnd = null;
        _impactAt = null;
        _impactMagnitude = 0.0;
        _stillStart = null;
        _lastMagnitude = null;
    }

    function addSample(magnitude, nowMs) {
        if (_lastTrigger != null && nowMs - _lastTrigger < COOLDOWN_MS) {
            reset();
            return null;
        }

        if (_phase == PHASE_IDLE) {
            if (magnitude <= FREE_FALL_THRESHOLD_MG) {
                _phase = PHASE_FREE_FALL;
                _freeFallStart = nowMs;
            }
            _lastMagnitude = magnitude;
            return null;
        }

        if (_phase == PHASE_FREE_FALL) {
            if (magnitude <= FREE_FALL_THRESHOLD_MG) {
                _lastMagnitude = magnitude;
                return null;
            }

            if (nowMs - _freeFallStart >= MIN_FREE_FALL_MS) {
                _phase = PHASE_AWAIT_IMPACT;
                _freeFallEnd = nowMs;
            } else {
                reset();
                _lastMagnitude = magnitude;
                return null;
            }
        }

        if (_phase == PHASE_AWAIT_IMPACT) {
            if (nowMs - _freeFallEnd > IMPACT_WINDOW_MS) {
                reset();
                _lastMagnitude = magnitude;
                return null;
            }

            if (magnitude >= IMPACT_THRESHOLD_MG) {
                _phase = PHASE_AWAIT_STILLNESS;
                _impactAt = nowMs;
                _impactMagnitude = magnitude;
                _stillStart = null;
            }
            _lastMagnitude = magnitude;
            return null;
        }

        if (_phase == PHASE_AWAIT_STILLNESS) {
            var delta = 0;
            if (_lastMagnitude != null) {
                delta = magnitude - _lastMagnitude;
            }
            if (delta < 0) {
                delta = -delta;
            }

            if (delta <= STILLNESS_DELTA_MG && magnitude >= REST_MIN_MG && magnitude <= REST_MAX_MG) {
                if (_stillStart == null) {
                    _stillStart = nowMs;
                }
                if (nowMs - _stillStart >= STILLNESS_MS) {
                    _lastTrigger = nowMs;
                    var fall = {
                        "freeFallMs" => _freeFallEnd - _freeFallStart,
                        "impactMagnitude" => _impactMagnitude,
                        "stillSeconds" => (nowMs - _stillStart) / 1000
                    };
                    reset();
                    _lastMagnitude = magnitude;
                    return fall;
                }
            } else {
                _stillStart = null;
            }
        }

        _lastMagnitude = magnitude;
        return null;
    }
}
