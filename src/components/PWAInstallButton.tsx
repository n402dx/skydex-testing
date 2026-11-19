import {Download} from 'lucide-react';
import React, {useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {Button} from './ui/button';

interface Props {
  onFallbackSync?: () => void;
}

export const PWAInstallButton: React.FC<Props> = ({onFallbackSync}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return onFallbackSync ? (
      <Button size="default" onClick={onFallbackSync}>
        Sync Live
      </Button>
    ) : null;
  }

  if (isInstallable) {
    return (
      <Button size="default" onClick={install}>
        <Download className="w-3.5 h-3.5" />
        Install App
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button size="default" onClick={() => setShowIOSGuide(true)}>
          <Download className="w-3.5 h-3.5" />
          Install App
        </Button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-sm rounded-lg bg-card border border-border p-6">
              <h3 className="text-base font-semibold text-foreground">Install SkyDeck on iOS</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                1. Tap Share in Safari.
                <br />
                2. Select Add to Home Screen for offline radar and flight plans.
              </p>
              <Button className="mt-4 w-full" onClick={() => setShowIOSGuide(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return onFallbackSync ? (
    <Button size="default" onClick={onFallbackSync}>
      Sync Live
    </Button>
  ) : null;
};
