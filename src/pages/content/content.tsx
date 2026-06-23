import { useEffect } from 'react';
import Sidebar from '../../layout/molecule/sidebar/sidebar';
import Terminal from '../../layout/molecule/terminal/terminal';
import { useDashboardStore } from '../../stores/use-dashboard-store';
import { useNavStore } from '../../stores/use-nav-store';
import { useSshConnection } from '../../hooks/use-ssh-connection';
import { useMonitorStore } from '../../stores/use-monitor-store';
import { useScriptFiles } from '../../hooks/use-script-files';
import { useMockHistory } from '../../hooks/use-mock-history';
import Overview from './elements/overview';
import Monitor from './elements/monitor';
import Scripts from './elements/scripts';
import HistoryView from './elements/history';
import SettingsView from './elements/settings';
import './content-shared.css';
import './content.css';

export default function Content() {
  const activeSection = useDashboardStore((s) => s.activeSection);
  const terminalExpanded = useDashboardStore((s) => s.terminalExpanded);
  const toggleTerminal = useDashboardStore((s) => s.toggleTerminal);
  const setTerminalExpanded = useDashboardStore((s) => s.setTerminalExpanded);
  const goToLanding = useNavStore((s) => s.goToLanding);

  const connection = useSshConnection();
  const setConnectionStage = useDashboardStore((s) => s.setConnectionStage);

  useEffect(() => {
    setConnectionStage(connection.stage);
  }, [connection.stage, setConnectionStage]);

  // Register the monitor:* event listeners once (guarded module-level inside the store).
  useEffect(() => {
    void useMonitorStore.getState().init();
  }, []);

  // Drives the dedicated metrics-polling SSH connection (independent of the
  // interactive terminal session) off the same lifecycle the terminal-based
  // SSH detection already produces. `info` is only populated once a parsable
  // host/user/port was captured (see use-ssh-connection.ts) — without it the
  // monitor simply doesn't start and the Overview cards stay in "connecting".
  useEffect(() => {
    const monitor = useMonitorStore.getState();
    if (connection.isOnline && connection.info) {
      void monitor.start(connection.pemPath, connection.info.user, connection.info.host, connection.info.port);
    } else {
      void monitor.stop();
    }
  }, [connection.isOnline, connection.info, connection.pemPath]);

  // Defense-in-depth: stop the monitoring connection if Content itself leaves
  // the tree (e.g. logout navigates away in the same batch as disconnect()).
  useEffect(() => {
    return () => {
      void useMonitorStore.getState().stop();
    };
  }, []);

  const scripts = useScriptFiles();
  const history = useMockHistory();

  // "Ejecutar" only uploads the script so far (see use-script-remote.ts) — it
  // doesn't actually run anything on the instance yet, so there's never a
  // running script to report.
  const runningScripts = 0;

  const handleLogout = () => {
    connection.disconnect();
    setTerminalExpanded(false);
    goToLanding();
  };

  let section = null;
  switch (activeSection) {
    case 'overview':
      section = <Overview connection={connection} />;
      break;
    case 'monitor':
      section = <Monitor connection={connection} />;
      break;
    case 'scripts':
      section = <Scripts scripts={scripts} connection={connection} />;
      break;
    case 'history':
      section = <HistoryView history={history} />;
      break;
    case 'settings':
      section = <SettingsView connection={connection} />;
      break;
  }

  return (
    <div className="dashboard">
      <Sidebar
        connectionStage={connection.stage}
        runningScripts={runningScripts}
        onLogout={handleLogout}
      />
      <div className="dashboard__main">
        <div className="dashboard__content">
          {section}
        </div>
        <Terminal
          expanded={terminalExpanded}
          onToggleExpanded={toggleTerminal}
        />
      </div>
    </div>
  );
}
