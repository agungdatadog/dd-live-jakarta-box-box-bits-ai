import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

export function initDatadog() {
  if (typeof window === 'undefined') return;

  const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
  const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;
  const site = process.env.NEXT_PUBLIC_DATADOG_SITE || 'datadoghq.com';
  const service = process.env.NEXT_PUBLIC_DATADOG_SERVICE || 'box-box-bits-ai';
  const env = process.env.NEXT_PUBLIC_DATADOG_ENV || 'production';
  const version = process.env.NEXT_PUBLIC_DD_VERSION || 'dev';

  if (!clientToken) {
    console.warn('Datadog not initialized: missing NEXT_PUBLIC_DATADOG_CLIENT_TOKEN');
    return;
  }

  if (!datadogLogs.getInitConfiguration()) {
    datadogLogs.init({
      clientToken,
      site,
      service,
      env,
      version,
      // Capture uncaught exceptions and forward them to Logs Management.
      forwardErrorsToLogs: true,
      // Forward console.error / console.warn calls as Datadog logs.
      forwardConsoleLogs: ['error', 'warn'],
      sessionSampleRate: 100,
    });
  }

  if (!datadogRum.getInitConfiguration()) {
    if (!applicationId) {
      console.warn('Datadog RUM not initialized: missing NEXT_PUBLIC_DATADOG_APPLICATION_ID');
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
      // Enables the RUM Feature Flag Tracking tab and pins evaluated flags
      // onto each session. Required alongside datadogRum.addFeatureFlagEvaluation().
      enableExperimentalFeatures: ['feature_flags'],
      // Inject tracing headers into same-origin /api/* requests so each chat
      // fetch is linked to its backend APM trace in the Datadog UI.
      allowedTracingUrls: [
        (url: string) => url.startsWith(`${window.location.origin}/api/`),
      ],
    });

    datadogRum.startSessionReplayRecording();
  }
}
