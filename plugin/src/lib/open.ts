import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';

function isWsl(): boolean {
  return os.release().toLowerCase().includes('microsoft');
}

function openerCommand(file: string): [string, string[]] {
  switch (process.platform) {
    case 'darwin':
      return ['open', [file]];
    case 'win32':
      return ['explorer.exe', [file]];
    default:
      if (isWsl()) {
        // xdg-open is usually missing under WSL, and the default browser lives on the Windows side.
        const windowsPath = execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim();
        return ['explorer.exe', [windowsPath]];
      }
      return ['xdg-open', [file]];
  }
}

/**
 * Resolves once the opener has started; its exit code is ignored because explorer.exe
 * exits with 1 even when it succeeds.
 */
export function openInDefaultApp(file: string): Promise<void> {
  const [command, args] = openerCommand(file);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
