import CoreLocation
import ExpoModulesCore

public class CompassHeadingModule: Module {
  private var manager: CLLocationManager?
  private var delegate: HeadingDelegate?

  public func definition() -> ModuleDefinition {
    Name("CompassHeading")

    Events("onHeading")

    Function("isAvailable") {
      CLLocationManager.headingAvailable()
    }

    OnStartObserving {
      // CLLocationManager must be CREATED and used on a thread with an active run loop
      // (the main thread) — not on the module-init thread. So both the creation and the
      // start happen inside the main-queue dispatch.
      DispatchQueue.main.async {
        let delegate = HeadingDelegate { [weak self] heading in
          self?.sendEvent("onHeading", [
            "trueHeading": heading.trueHeading,
            "magHeading": heading.magneticHeading,
            "accuracy": heading.headingAccuracy,
            // iOS fuses + calibrates internally (CLHeading) and shows its own figure-8 HUD; the raw
            // magnetometer accuracy/field are not exposed, so emit the absent sentinels (-1) → the JS
            // reliability gate falls back to CLHeading.headingAccuracy on iOS.
            "magAccuracy": -1,
            "fieldMicroTesla": -1.0,
          ])
        }
        let manager = CLLocationManager()
        manager.delegate = delegate
        // Report ALL heading changes (no minimum-angle filter). headingFilter is the minimum
        // angular change vs the last DELIVERED event; its default is already 1°, and ANY positive
        // value quantizes a slow qibla-alignment turn into >=filter° steps that freeze the rose
        // (the slow-rotation freeze). kCLHeadingFilterNone lets CoreLocation's own (modest, fused)
        // cadence through — the JS per-frame follow + EMA do the smoothing. (rules/11; spec
        // docs/superpowers/specs/2026-06-05-qibla-slow-rotation-freeze-fix-design.md §7.2)
        manager.headingFilter = kCLHeadingFilterNone
        manager.startUpdatingHeading()
        self.delegate = delegate
        self.manager = manager
      }
    }

    OnStopObserving {
      DispatchQueue.main.async {
        self.manager?.stopUpdatingHeading()
        self.manager?.delegate = nil
        self.manager = nil
        self.delegate = nil
      }
    }
  }
}

private class HeadingDelegate: NSObject, CLLocationManagerDelegate {
  private let onHeading: (CLHeading) -> Void

  init(onHeading: @escaping (CLHeading) -> Void) {
    self.onHeading = onHeading
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    onHeading(newHeading)
  }

  // Let iOS present the figure-8 calibration HUD when accuracy is poor, so a user with an
  // unreliable compass can recover instead of being stuck on the red qibla banner forever.
  func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
    return true
  }
}
