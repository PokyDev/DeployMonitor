import { SlideMessageProvider } from '@poky-dev/slide-message';
import '@poky-dev/slide-message/dist/slide-message.css';

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SlideMessageProvider>
      <App />
    </SlideMessageProvider>
  </React.StrictMode>,
);
