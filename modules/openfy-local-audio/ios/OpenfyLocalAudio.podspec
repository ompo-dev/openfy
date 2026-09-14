Pod::Spec.new do |s|
  s.name           = 'OpenfyLocalAudio'
  s.version        = '1.0.0'
  s.summary        = 'Openfy local audio container repair'
  s.description    = 'Lossless on-device normalization of downloaded DASH audio.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4', :tvos => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CryptoKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
