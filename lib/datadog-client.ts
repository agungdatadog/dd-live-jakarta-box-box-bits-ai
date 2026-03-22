import { datadogRum } from '@datadog/browser-rum';

export function initDatadog() {
  if (typeof window !== 'undefined' && !datadogRum.getInitConfiguration()) {
    datadogRum.init({
      applicationId: '79cbd3bc-8125-450f-90ca-3258853e71a7',
      clientToken: 'pub7f18b193757ab4fd3d2b2846b63a5900',
      site: 'datadoghq.com',
      service: 'box-box-ai',
      env: 'dev',
      // Specify a version number to identify the deployed version of your application in Datadog
      version: '1.0.0',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 100,
      trackBfcacheViews: true,
      trackResources: true,
      trackLongTasks: true,
      trackUserInteractions: true,
      defaultPrivacyLevel: 'allow',
      // Inject tracing headers into same-origin /api/* requests so each chat
      // fetch is linked to its backend APM trace in the Datadog UI.
      allowedTracingUrls: [
        (url: string) => url.startsWith(`${window.location.origin}/api/`),
      ],
    });
    
    datadogRum.startSessionReplayRecording();
  }
}
