import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/Toast';
import { watchForUpdate } from '@/lib/appUpdate';
import { useGame } from '@/lib/rpg/game';

/** "A new version of Kan is ready" with Reload, once nothing is being written (audit 10). */
export function AppUpdateNotice() {
  const { showToast } = useToast();
  const { isNarrating, isProcessing } = useGame();
  const [ready, setReady] = useState(false);
  const shown = useRef(false);

  useEffect(() => watchForUpdate(() => setReady(true)), []);

  useEffect(() => {
    if (!ready || shown.current || isNarrating || isProcessing) return;
    shown.current = true;
    showToast('A new version of Kan is ready.', 'info', {
      durationMs: null,
      action: { label: 'Reload', onPress: () => window.location.reload() },
    });
  }, [isNarrating, isProcessing, ready, showToast]);

  return null;
}
