using Toybox.WatchUi;

class FamilyCareFallDelegate extends WatchUi.BehaviorDelegate {
    private var _model;
    private var _view;

    function initialize(model, view) {
        BehaviorDelegate.initialize();
        _model = model;
        _view = view;
    }

    function onSelect() {
        return _model.cancelCountdown();
    }

    function onBack() {
        if (_model.cancelCountdown()) {
            return true;
        }
        return false;
    }
}
