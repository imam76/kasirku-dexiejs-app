import { useEffect, useState } from 'react';
import {
  readSubscription,
  SUBSCRIPTION_EVENT,
  SUBSCRIPTION_KEY,
} from './storage';

export function useSubscription() {
  const [subscription, setSubscription] = useState(readSubscription);
  useEffect(() => {
    const refresh = () => setSubscription(readSubscription());
    const storage = (event: StorageEvent) => {
      if (event.key === SUBSCRIPTION_KEY || event.key === null) refresh();
    };
    window.addEventListener(SUBSCRIPTION_EVENT, refresh);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(SUBSCRIPTION_EVENT, refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return subscription;
}
