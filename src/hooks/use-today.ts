import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dateKey } from '@/utils/date';

/** Today's date key; refreshes when the app comes back to the foreground (e.g. after midnight). */
export function useToday(): string {
  const [today, setToday] = useState(dateKey);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(dateKey());
    });
    return () => sub.remove();
  }, []);
  return today;
}
