import { datadogRum } from '@datadog/browser-rum';

export function initDatadog() {
  if (typeof window !== 'undefined' && !datadogRum.getInitConfiguration()) {
    const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
    const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;
    const site = process.env.NEXT_PUBLIC_DATADOG_SITE || 'datadoghq.com';
    const service = process.env.NEXT_PUBLIC_DATADOG_SERVICE || 'box-box-bits-ai';
    const env = process.env.NEXT_PUBLIC_DATADOG_ENV || 'production';
    const version = process.env.NEXT_PUBLIC_DD_VERSION || 'dev';

    if (!applicationId || !clientToken) {
      console.warn('Datadog RUM not initialized: missing NEXT_PUBLIC_DATADOG_APPLICATION_ID or NEXT_PUBLIC_DATADOG_CLIENT_TOKEN');
      return;
    }

    datadogRum.init({
      applicationId,
      clientToken,
      site,
      service,
      env,
      version,
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
