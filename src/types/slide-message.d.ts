declare module '@poky-dev/slide-message' {
  import type { ReactNode } from 'react';

  type NotifyPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  interface NotifyOptions {
    position: NotifyPosition;
    offsetY?: number;
    message?: string;
    duration?: number;
  }

  interface SlideMessageContextValue {
    notify: (options: NotifyOptions) => void;
  }

  export function SlideMessageProvider(props: { children: ReactNode }): JSX.Element;
  export function useSlideMessage(): SlideMessageContextValue;
}
