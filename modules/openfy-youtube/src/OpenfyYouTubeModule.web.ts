import { registerWebModule, NativeModule } from 'expo';

// Browsers control the media connection, User-Agent and CORS policy. The
// download manager deliberately uses its JavaScript/web path there instead.
class OpenfyYouTubeModule extends NativeModule<{}> {}

export default registerWebModule(OpenfyYouTubeModule, 'OpenfyYouTube');
