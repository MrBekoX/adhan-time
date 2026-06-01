import CoreLocation
import ExpoModulesCore

public class CompassHeadingModule: Module {
  private let manager = CLLocationManager()
  private var delegate: HeadingDelegate?

  public func definition() -> ModuleDefinition {
    Name("CompassHeading")

    Events("onHeading")

    Function("isAvailable") {
      CLLocationManager.headingAvailable()
    }

    OnStartObserving {
      let delegate = HeadingDelegate { [weak self] heading in
        self?.sendEvent("onHeading", [
          "trueHeading": heading.trueHeading,
          "magHeading": heading.magneticHeading,
          "accuracy": heading.headingAccuracy,
        ])
      }
      self.delegate = delegate
      // CLLocationManager must be touched on the main thread.
      DispatchQueue.main.async {
        self.manager.delegate = delegate
        self.manager.headingFilter = 1
        self.manager.startUpdatingHeading()
      }
    }

    OnStopObserving {
      DispatchQueue.main.async {
        self.manager.stopUpdatingHeading()
        self.manager.delegate = nil
      }
      self.delegate = nil
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
}
