using Toybox.Application;
using Toybox.Lang;
using Toybox.WatchUi;

class FamilyCareGarminApp extends Application.AppBase {
    private var _model;

    function initialize() {
        AppBase.initialize();
        _model = new FamilyCareModel();
    }

    function onStart(state) {
        _model.load();
    }

    function onStop(state) {
        _model.stopSensors();
    }

    function getInitialView() {
        var view = new FamilyCareFallView(_model);
        var delegate = new FamilyCareFallDelegate(_model, view);
        return [ view, delegate ];
    }
}
