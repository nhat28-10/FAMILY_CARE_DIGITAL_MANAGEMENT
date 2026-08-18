using Toybox.Application;
using Toybox.Communications;
using Toybox.Lang;
using Toybox.Math;
using Toybox.Sensor;
using Toybox.System;
using Toybox.Time;
using Toybox.Timer;
using Toybox.WatchUi;

class FamilyCareModel {
    const PROP_PAIR_CODE = "pairCode";
    const PROP_PAIRED = "paired";
    const PROP_DEVICE_ID = "deviceId";

    const SENSOR_PERIOD_SEC = 1;
    const SAMPLE_RATE_HZ = 25;
    const SAMPLE_INTERVAL_MS = 40;
    const COUNTDOWN_SEC = 20;

    var pairCode = "";
    var paired = false;
    var deviceId = null;
    var memberName = null;

    var x = 0.0;
    var y = 0.0;
    var z = 0.0;
    var magnitude = 0.0;
    var demoHeartRate = 82;
    var demoHeartRateStatus = "HR demo idle";
    var sampleCount = 0;
    var status = "WAIT_PAIR";
    var lastSendStatus = "";
    var countdown = 0;
    var sensorRunning = false;

    private var _detector;
    private var _heartRateDemo;
    private var _countdownTimer;
    private var _pendingFall;
    private var _view;
    private var _transmitListener;

    function initialize() {
        _detector = new FamilyCareFallDetector();
        _heartRateDemo = new FamilyCareHeartRateDemo();
        _countdownTimer = null;
        _pendingFall = null;
        _transmitListener = new FamilyCareTransmitListener(self);
    }

    function setView(view) {
        _view = view;
    }

    function load() {
        var app = Application.getApp();
        pairCode = app.getProperty(PROP_PAIR_CODE);
        if (pairCode == null || pairCode.equals("")) {
            pairCode = makePairCode();
            app.setProperty(PROP_PAIR_CODE, pairCode);
        }

        paired = app.getProperty(PROP_PAIRED) == true;
        deviceId = app.getProperty(PROP_DEVICE_ID);
        if (paired) {
            status = "ARMED";
        } else {
            status = "WAIT_PAIR";
        }

        Communications.registerForPhoneAppMessages(method(:onPhoneMessage));
        startSensors();
    }

    function startSensors() {
        if (sensorRunning) {
            return;
        }

        var legacyOptions = {
            :period => SENSOR_PERIOD_SEC,
            :sampleRate => SAMPLE_RATE_HZ,
            :enableAccelerometer => true
        };

        try {
            Sensor.registerSensorDataListener(method(:onSensorData), legacyOptions);
            sensorRunning = true;
            lastSendStatus = "sensor legacy";
        } catch(e) {
            startSensorsNested();
        }
    }

    private function startSensorsNested() {
        var nestedOptions = {
            :period => SENSOR_PERIOD_SEC,
            :accelerometer => {
                :enabled => true,
                :sampleRate => SAMPLE_RATE_HZ
            }
        };

        try {
            Sensor.registerSensorDataListener(method(:onSensorData), nestedOptions);
            sensorRunning = true;
            lastSendStatus = "sensor nested";
        } catch(e) {
            status = "SENSOR_ERR";
            lastSendStatus = "sensor setup failed";
            requestUpdate();
        }
    }

    function stopSensors() {
        if (!sensorRunning) {
            return;
        }
        Sensor.unregisterSensorDataListener();
        sensorRunning = false;
        stopCountdown();
    }

    function onPhoneMessage(msg as Communications.PhoneAppMessage) as Void {
        var data = msg.data;
        if (!(data instanceof Dictionary)) {
            return;
        }

        var type = data["type"];
        if (type == null) {
            type = data[:type];
        }

        if (type != null && type.equals("PAIR_CONFIRMED")) {
            paired = true;
            deviceId = valueOf(data, "deviceId");
            memberName = valueOf(data, "memberName");
            Application.getApp().setProperty(PROP_PAIRED, true);
            if (deviceId != null) {
                Application.getApp().setProperty(PROP_DEVICE_ID, deviceId);
            }
            status = "ARMED";
            requestUpdate();
        }
    }

    function onSensorData(sensorData as Sensor.SensorData) as Void {
        if (sensorData == null || sensorData.accelerometerData == null) {
            return;
        }

        var ax = sensorData.accelerometerData.x;
        var ay = sensorData.accelerometerData.y;
        var az = sensorData.accelerometerData.z;
        if (ax == null || ay == null || az == null || ax.size() == 0) {
            return;
        }

        for (var i = 0; i < ax.size(); i += 1) {
            x = ax[i].toFloat();
            y = ay[i].toFloat();
            z = az[i].toFloat();
            magnitude = Math.sqrt((x * x) + (y * y) + (z * z));
            sampleCount += 1;
            var sampleTimeMs = sampleCount * SAMPLE_INTERVAL_MS;
            var heartRateEvent = _heartRateDemo.addSample(magnitude, sampleTimeMs);
            demoHeartRate = _heartRateDemo.heartRate;
            demoHeartRateStatus = _heartRateDemo.status;

            if (paired && countdown == 0) {
                var fall = _detector.addSample(magnitude, sampleTimeMs);
                if (fall != null) {
                    beginCountdown(fall);
                } else if (heartRateEvent != null && !status.equals("SENDING")) {
                    sendHeartRateAbnormal(heartRateEvent);
                }
            }
        }

        requestUpdate();
    }

    function beginCountdown(fall) {
        _pendingFall = fall;
        countdown = COUNTDOWN_SEC;
        status = "FALL?";
        requestUpdate();

        if (_countdownTimer != null) {
            _countdownTimer.stop();
        }

        _countdownTimer = new Timer.Timer();
        _countdownTimer.start(method(:onCountdownTick), 1000, true);
    }

    function onCountdownTick() as Void {
        countdown -= 1;
        if (countdown <= 0) {
            stopCountdown();
            sendFallDetected();
        } else {
            requestUpdate();
        }
    }

    function cancelCountdown() {
        if (countdown <= 0) {
            return false;
        }
        stopCountdown();
        status = "ARMED";
        _pendingFall = null;
        _detector.reset();
        requestUpdate();
        return true;
    }

    function stopCountdown() {
        if (_countdownTimer != null) {
            _countdownTimer.stop();
            _countdownTimer = null;
        }
        countdown = 0;
    }

    function sendFallDetected() {
        if (!paired || _pendingFall == null) {
            if (paired) {
                status = "ARMED";
            } else {
                status = "WAIT_PAIR";
            }
            return;
        }

        status = "SENDING";
        requestUpdate();

        var payload = {
            "type" => "FALL_DETECTED",
            "source" => "garmin_fr735xt",
            "deviceIdentifier" => pairCode,
            "deviceId" => deviceId,
            "magnitude" => magnitude,
            "x" => x,
            "y" => y,
            "z" => z,
            "freeFallMs" => _pendingFall["freeFallMs"],
            "impactMagnitude" => _pendingFall["impactMagnitude"],
            "stillSeconds" => _pendingFall["stillSeconds"],
            "detectedAt" => Time.now().value()
        };

        Communications.transmit(payload, {}, _transmitListener);
        _pendingFall = null;
    }

    function sendHeartRateAbnormal(heartRateEvent) {
        if (!paired || heartRateEvent == null) {
            return;
        }

        status = "SENDING";
        requestUpdate();

        var payload = {
            "type" => "HEART_RATE_ABNORMAL",
            "source" => "garmin_fr735xt",
            "simulated" => true,
            "simulationReason" => "demo_motion_to_heart_rate_curve",
            "deviceIdentifier" => pairCode,
            "deviceId" => deviceId,
            "heartRate" => heartRateEvent["heartRate"],
            "thresholdHigh" => heartRateEvent["thresholdHigh"],
            "thresholdLow" => heartRateEvent["thresholdLow"],
            "durationSeconds" => heartRateEvent["durationSeconds"],
            "magnitude" => magnitude,
            "x" => x,
            "y" => y,
            "z" => z,
            "detectedAt" => Time.now().value()
        };

        Communications.transmit(payload, {}, _transmitListener);
    }

    function onTransmitComplete() {
        status = "SENT";
        lastSendStatus = "phone ok";
        requestUpdate();
    }

    function onTransmitError() {
        status = "SEND_ERR";
        lastSendStatus = "phone error";
        requestUpdate();
    }

    private function requestUpdate() {
        if (_view != null) {
            WatchUi.requestUpdate();
        }
    }

    private function makePairCode() {
        var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var seed = Time.now().value();
        var suffix = "";
        for (var i = 0; i < 6; i += 1) {
            seed = ((seed * 1103515245) + 12345) % 2147483647;
            var idx = seed % alphabet.length();
            suffix += alphabet.substring(idx, idx + 1);
        }
        return "FCG-735XT-" + suffix;
    }

    private function valueOf(data, key) {
        return data[key];
    }
}

class FamilyCareTransmitListener extends Communications.ConnectionListener {
    private var _model;

    function initialize(model) {
        ConnectionListener.initialize();
        _model = model;
    }

    function onComplete() {
        _model.onTransmitComplete();
    }

    function onError() {
        _model.onTransmitError();
    }
}
