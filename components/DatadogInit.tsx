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
  }, [initialize]);

  useEffect(() => {
    if (userId) {
      datadogRum.setUser({
        id: userId,
        name: username,
      });
    }
  }, [userId, username]);

  return null;
}
