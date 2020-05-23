import { ChildProcess, spawn } from 'child_process';

import { CancellablePromise } from './CancellablePromise';

export function executeCommand(command: string, options?: { cwd: string }): CancellablePromise<{ stdout: string; stderr: string; returnCode: number }> {
  let process: ChildProcess | undefined = undefined;
  let cancelled = false;

  const promise: any = new Promise((resolve, reject) => {
    process = spawn(command, { ...(options || {}), shell: true });

    let stdout = '';
    let stderr = '';
    process.stdout &&
      process.stdout.on('data', (data) => {
        stdout = stdout + data.toString();
      });

    process.stderr &&
      process.stderr.on('data', (data) => {
        stderr = stderr + data.toString();
      });

    process.on('exit', (returnCode) => {
      if (returnCode === 0) {
        resolve({ stdout, stderr, returnCode });
      } else {
        console.warn(`Dingo: child process exited with code ${returnCode}`);
        console.warn(command, options);
        if (stderr) {
          reject(new Error(stderr));
        } else {
          reject(new Error('Return Code' + returnCode));
        }
      }
      process = undefined;
    });
  });

  promise.cancel = () => {
    if (process && !cancelled) {
      process.kill();
      cancelled = true;
    }
  };

  return promise;
}
