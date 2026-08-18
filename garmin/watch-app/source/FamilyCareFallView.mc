using Toybox.Graphics;
using Toybox.Lang;
using Toybox.WatchUi;

class FamilyCareFallView extends WatchUi.View {
    private var _model;

    function initialize(model) {
        View.initialize();
        _model = model;
        _model.setView(self);
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        if (_model.countdown > 0) {
            drawFallAlert(dc);
            return;
        }

        if (!_model.paired) {
            drawPairing(dc);
            return;
        }

        drawProtected(dc);
    }

    private function drawPairing(dc) {
        var y = 8;

        drawCenter(dc, "Family Care", y, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        y += 24;
        drawCenter(dc, "NOT PAIRED", y, Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY);
        y += 24;
        drawCenter(dc, pairPrefix(), y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        y += 16;
        drawCenter(dc, pairSuffix(), y, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        y += 32;
        drawCenter(dc, "Open Family Care", y, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
        y += 16;
        drawCenter(dc, "on phone", y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        y += 18;
        drawCenter(dc, "Status: " + _model.status, y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        y += 14;
        drawCenter(dc, "M " + formatNumber(_model.magnitude) + " HR " + _model.demoHeartRate, y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
    }

    private function drawProtected(dc) {
        var y = 8;

        drawCenter(dc, "Family Care", y, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        y += 24;
        drawCenter(dc, "PROTECTED", y, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        y += 22;
        if (_model.memberName != null) {
            drawCenter(dc, _model.memberName, y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
            y += 16;
        }
        drawCenter(dc, "Fall detection ON", y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        y += 22;
        drawCenter(dc, "M " + formatNumber(_model.magnitude), y, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE);
        y += 26;
        drawCenter(dc, "HR demo " + _model.demoHeartRate, y, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
        y += 16;
        drawCenter(dc, _model.demoHeartRateStatus, y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        y += 16;
        drawCenter(dc, "Samples " + _model.sampleCount, y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
    }

    private function drawFallAlert(dc) {
        var y = 8;

        drawCenter(dc, "FALL DETECTED", y, Graphics.FONT_SMALL, Graphics.COLOR_WHITE);
        y += 28;
        drawCenter(dc, "Sending SOS in", y, Graphics.FONT_TINY, Graphics.COLOR_LT_GRAY);
        y += 16;
        drawCenter(dc, _model.countdown + "", y, Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE);
        y += 44;
        drawCenter(dc, "START to cancel", y, Graphics.FONT_TINY, Graphics.COLOR_WHITE);
    }

    private function drawCenter(dc, text, y, font, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function formatNumber(value) {
        var scaled = (value * 10).toNumber();
        var decimal = scaled % 10;
        if (decimal < 0) {
            decimal = -decimal;
        }
        return (scaled / 10) + "." + decimal;
    }

    private function pairPrefix() {
        var len = _model.pairCode.length();
        if (len > 6) {
            return _model.pairCode.substring(0, len - 6);
        }
        return _model.pairCode;
    }

    private function pairSuffix() {
        var len = _model.pairCode.length();
        if (len > 6) {
            return _model.pairCode.substring(len - 6, len);
        }
        return _model.pairCode;
    }
}
