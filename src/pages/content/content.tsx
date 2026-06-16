import { useEffect } from 'react';
import Sidebar from '../../layout/molecule/sidebar/sidebar';
import Terminal from '../../layout/molecule/terminal/terminal';
import { useDashboardStore } from '../../stores/use-dashboard-store';
import { useNavStore } from '../../stores/use-nav-store';
import { useSshConnection } from '../../hooks/use-ssh-connection';
import { useMockMetrics } from '../../hooks/use-mock-metrics';
import { useMockScripts } from '../../hooks/use-mock-scripts';
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

  const metrics = useMockMetrics(connection.isOnline);
  const scripts = useMockScripts();
  const history = useMockHistory();

  const runningScripts = scripts.execution?.status === 'running' ? 1 : 0;

  const handleLogout = () => {
    connection.disconnect();
    setTerminalExpanded(false);
    goToLanding();
  };

  let section = null;
  switch (activeSection) {
    case 'overview':
      section = <Overview connection={connection} metrics={metrics} />;
      break;
    case 'monitor':
      section = <Monitor metrics={metrics} />;
      break;
    case 'scripts':
      section = <Scripts scripts={scripts} />;
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
