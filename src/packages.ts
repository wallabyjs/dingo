import * as fs from 'fs';
import * as path from 'path';

import { CancellablePromise } from './CancellablePromise';
import { executeCommand } from './executeCommand';

export function installPackages(directory: string, npmPath: string, yarnPath: string): CancellablePromise<void> {
  let cancelled = false;
  let waitingPromise: CancellablePromise<{ stdout: string; stderr: string; returnCode: number }> | undefined = undefined;

  const promise = new Promise<void>(async (resolve, reject) => {
    try {
      const packageJson = path.join(directory, 'package.json');
      if (!fs.existsSync(packageJson)) {
        return;
      }

      const npmInstall = async () => {
        try {
          waitingPromise = executeCommand(`${npmPath || 'npm'} install`, { cwd: directory });
          await waitingPromise;
          waitingPromise = undefined;
        } catch (e) {
          if (cancelled) { throw new Error('Cancelled'); }
          console.warn('Error running `npm install`', e);
          throw new Error('Error installing packages');
        }
      };

      const yarnLock = path.join(directory, 'yarn.lock');

      if (fs.existsSync(yarnLock)) {
        try {
          waitingPromise = executeCommand(`${yarnPath || 'yarn'}`, { cwd: directory });
          await waitingPromise;
          waitingPromise = undefined;
        } catch (e) {
          if (cancelled) { throw new Error('Cancelled'); }
          console.warn('Error running `yarn`', e);
          await npmInstall();
        }
      } else {
        await npmInstall();
      }
      resolve();
    } catch (e) {
      reject(e);
    }
  });

  (promise as CancellablePromise<void>).cancel = () => {
    if (cancelled) { return; }
    cancelled = true;
    if (waitingPromise) {
      waitingPromise.cancel();
    }
  };

  return promise as CancellablePromise<void>;
}
