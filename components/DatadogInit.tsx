'use client';

import { useEffect } from 'react';
import { initDatadog } from '@/lib/datadog-client';
import { useUserStore } from '@/store/userStore';
import { datadogRum } from '@datadog/browser-rum';

export default function DatadogInit() {
  const { userId, username, initialize } = useUserStore();

  useEffect(() => {
    initDatadog();
    initialize();

    if (datadogRum.getInitConfiguration()) {
      datadogRum.setGlobalContextProperty('app.name', 'box-box-bits-ai');
      datadogRum.setGlobalContextProperty('app.applet_id', process.env.NEXT_PUBLIC_APPLET_ID || 'unknown');
      datadogRum.setGlobalContextProperty('app.version', process.env.NEXT_PUBLIC_DD_VERSION || 'dev');
    }
  }, [initialize]);

  useEffect(() => {
    if (userId) {
      datadogRum.setUser({
        id: userId,
        name: username,
      });
      datadogRum.setGlobalContextProperty('usr.id', userId);
      datadogRum.setGlobalContextProperty('usr.name', username);
    }
  }, [userId, username]);

  return null;
}
