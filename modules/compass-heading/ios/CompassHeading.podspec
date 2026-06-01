Pod::Spec.new do |s|
  s.name           = 'CompassHeading'
  s.version        = '0.1.0'
  s.summary        = 'Fused device heading for the qibla compass'
  s.description    = 'Rotation-vector / CLHeading fused heading source'
  s.author         = ''
  s.homepage       = 'https://github.com/adhan-time/compass-heading'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
