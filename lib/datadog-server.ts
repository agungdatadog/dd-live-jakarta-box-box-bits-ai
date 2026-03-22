let tracer: any;

try {
  // Use require to avoid top-level import issues with native modules
  tracer = require('dd-trace');
  if (!process.env.DISABLE_DATADOG_APM) {
    tracer.init({
      service: process.env.NEXT_PUBLIC_DATADOG_SERVICE || 'box-box-bits-ai',
      env: process.env.NEXT_PUBLIC_DATADOG_ENV || 'production',
      logInjection: true,
    });
  }
} catch (e) {
  console.warn('Datadog APM initialization failed, using mock tracer:', e);
  tracer = {
    startSpan: () => ({
      setTag: () => {},
      finish: () => {}
    })
  };
}

export default tracer;
