import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

import { CancellablePromise } from './CancellablePromise';
import { executeCommand } from './executeCommand';

function rimrafPromise(path: string, options: rimraf.Options): Promise<void> {
  return new Promise((resolve, reject) => {
    rimraf(path, options, (error) => {
      if (error) {
        reject();
      } else {
        resolve();
      }
    });
  });
}

export interface Commit {
  id?: string;
  label: string;
  repoUrl: string;
  directory: string;
}

export function getDefaultDownloadDirectory(root: string, repoUrl: string) {
  const [repoName, parentName] = repoUrl
    .replace(/\.git$/, '')
    .replace(/:/, '/')
    .split('/')
    .reverse();

  return path.join(root, parentName ? `${parentName}-${repoName}` : repoName);
}

export function getRepoShortName(repoUrl: string) {
  const [shortName] = repoUrl
    .replace(/\.git$/, '')
    .replace(/:/, '/')
    .split('/')
    .reverse();

  return shortName;
}

export function download(gitPath: string, commit: Commit, directory: string): CancellablePromise<void> {
  let cancelled = false;
  let waitingPromise: CancellablePromise<{ stdout: string; stderr: string; returnCode: number }> | undefined = undefined;

  const promise: any = new Promise(async (resolve, reject) => {
    try {
      await rimrafPromise(directory, {});

      fs.mkdirSync(directory);

      const gitCommand = gitPath || 'git';

      waitingPromise = executeCommand(`${gitCommand} init`, { cwd: directory });
      await waitingPromise;
      if (cancelled) reject(new Error('Cancelled'));

      waitingPromise = executeCommand(`${gitCommand} remote add origin ${commit.repoUrl}`, { cwd: directory });
      await waitingPromise;
      if (cancelled) reject(new Error('Cancelled'));

      if (!commit.id) {
        waitingPromise = executeCommand(`${gitCommand} fetch --depth 1`, { cwd: directory });
        await waitingPromise;
        if (cancelled) reject(new Error('Cancelled'));

        waitingPromise = executeCommand(`${gitCommand} checkout master`, { cwd: directory });
        await waitingPromise;
        if (cancelled) reject(new Error('Cancelled'));
      } else {
        waitingPromise = executeCommand(`${gitCommand} fetch --depth 1 origin ` + commit.id!, { cwd: directory });
        await waitingPromise;
        if (cancelled) reject(new Error('Cancelled'));

        waitingPromise = executeCommand(`${gitCommand} checkout ${commit.id!}`, { cwd: directory });
        await waitingPromise;
        if (cancelled) reject(new Error('Cancelled'));
      }
      resolve();
    } catch (e) {
      reject(e);
    }
  });

  promise.cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (waitingPromise) {
      waitingPromise.cancel();
    }
  };

  return promise;
}

export function getBranchesOrTags(gitPath: string, repoUrl: string, requestType: 'Branches' | 'Tags'): CancellablePromise<Commit[]> {
  let cancelled = false;
  let remotePromise: CancellablePromise<{ stdout: string; stderr: string; returnCode: number }> | undefined = undefined;

  const promise: any = new Promise(async (resolve, reject) => {
    try {
      const parameter = requestType === 'Branches' ? '--heads' : '--tags';

      const gitCommand = gitPath || 'git';

      remotePromise = executeCommand(`${gitCommand} ls-remote --refs ${parameter} ${repoUrl}`);
      const result = await remotePromise;
      remotePromise = undefined;

      if (cancelled) {
        throw new Error('Cancelled');
      }

      resolve(
        result.stdout
          .replace(/\r/g, '')
          .split('\n')
          .map((line) => {
            const [id, label] = line.split('\t');
            return {
              id,
              label: (label || '').replace('refs/heads/', '').replace('refs/tags/', ''),
              repoUrl,
              directory: '',
            };
          })
          .filter((item) => item.id !== undefined && item.label !== '')
      );
    } catch (e) {
      reject(e);
    }
  });

  promise.cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (remotePromise) {
      remotePromise.cancel();
    }
  };

  return promise;
}
