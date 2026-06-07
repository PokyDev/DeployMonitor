import { useCallback, useRef, useState } from 'react';

export type TerminalLine = {
  id: number;
  text: string;
};

const WELCOME: string[] = [
  'Welcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-1041-aws x86_64)',
  '',
  '  System load:  0.34               Processes:           118',
  '  Usage of /:   48.1% of 80GB      Users logged in:     1',
  '  Memory usage: 60%                IPv4 address:        172.31.4.20',
  '',
  'Last login: Sat Jun  6 02:58:11 2026 from 187.190.4.118',
  'ubuntu@deploy-monitor-prod:~$ ',
];

const RESPONSES: Record<string, string[]> = {
  ls: ['app  backups  logs  scripts  docker-compose.yml'],
  pwd: ['/home/ubuntu'],
  whoami: ['ubuntu'],
  uptime: [' 03:21:08 up 14 days,  6:32,  1 user,  load average: 0.41, 0.38, 0.34'],
  date: ['Sat Jun  6 03:21:08 UTC 2026'],
  'df -h': [
    'Filesystem      Size  Used Avail Use% Mounted on',
    '/dev/root        80G   38G   42G  48% /',
  ],
};

let nextId = 1;

function makeLine(text: string): TerminalLine {
  return { id: nextId++, text };
}

/** Hardcoded terminal session — pushes a welcome banner and answers a small fixed command set. */
export function useMockTerminal() {
  const initial = useRef(WELCOME.map(makeLine));
  const [lines, setLines] = useState<TerminalLine[]>(initial.current);

  const push = useCallback((text: string) => {
    setLines((prev) => [...prev, makeLine(text)]);
  }, []);

  const runCommand = useCallback((raw: string) => {
    const command = raw.trim();
    push(`ubuntu@deploy-monitor-prod:~$ ${command}`);

    if (!command) {
      push('ubuntu@deploy-monitor-prod:~$ ');
      return;
    }

    const output = RESPONSES[command] ?? [`bash: ${command.split(' ')[0]}: command not found`];
    output.forEach(push);
    push('ubuntu@deploy-monitor-prod:~$ ');
  }, [push]);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, push, runCommand, clear };
}
