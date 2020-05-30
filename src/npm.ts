import * as fs from 'fs';
import * as path from 'path';

import { CancellablePromise } from './CancellablePromise';
import { executeCommand } from './executeCommand';
import { Commit, getBranchesOrTags } from './git';
import { jsonParse, normalizeRepositoryUrl } from './utils';

export interface PackageVersion {
  name: string;
  commit: Commit;
}

export function getCurrentPackageVersion(rootPath: string | undefined, packageName: string): string {
  if (!rootPath) return '';

  const filePath = path.join(rootPath, 'node_modules', packageName, 'package.json');
  if (fs.existsSync(filePath)) {
    const pkg = jsonParse<{ version: string }>(fs.readFileSync(filePath).toString());
    if (pkg === undefined) return '';
    return pkg.version;
  }

  return '';
}

function getVersionsFromTags(tags: Commit[]): Commit[] {
  return tags
    .map((item) => ({ ...item, parts: item.label.split('.') }))
    .filter((item) => item.parts.length === 3)
    .map((item) => {
      const [major, minor, revision] = item.parts;
      return { major: major.replace('v', ''), minor, revision, ...item };
    })
    .filter((item) => item.major !== undefined && item.minor !== undefined && item.revision !== undefined)
    .filter((item) => (item.major as any == parseInt(item.major.replace('v', ''))) && 
                      (item.minor as any == parseInt(item.minor)))
    .map((item) => ({
      ...item,
      major: parseInt(item.major.replace('v', '')),
      minor: parseInt(item.minor),
    }))
    .sort((a, b) => {
      if (a.major !== b.major) {
        return b.major - a.major;
      } else if (a.minor !== b.minor) {
        return b.minor - a.minor;
      } else if (a.revision !== b.revision) {
        // attempt to treat revision as a number. Accept that will return 0 if can't convert
        return parseInt(b.revision.replace('-', '')) - parseInt(a.revision.replace('-', ''));
      }
      return 0;
    })
    .map((item) => ({
      id: item.id,
      repoUrl: item.repoUrl,
      label: `${item.major}.${item.minor}.${item.revision}`,
      directory: item.directory,
    }));
}

export function getPackageVersions(gitPath: string, packageName: string): CancellablePromise<Commit[]> {
  let cancelled = false;
  let rawRegistryInfoPromise: CancellablePromise<{ stdout: string; stderr: string; returnCode: number }> | undefined = undefined;
  
  const promise: any = new Promise(async (resolve, reject) => {
    try {
      rawRegistryInfoPromise = executeCommand(`npm view ${packageName} repository --json`);
      const rawRegistryInfo = await rawRegistryInfoPromise;
      rawRegistryInfoPromise = undefined;
      
      if (cancelled) reject(new Error('Cancelled'));

      const registryInfo = jsonParse<{ url: string; directory: string | undefined }>(rawRegistryInfo.stdout);
  
      if (registryInfo === undefined || !registryInfo.url) {
        reject(new Error('Package not found.'));
        return;
      }
  
      const tags = await getBranchesOrTags(gitPath, normalizeRepositoryUrl(registryInfo.url), 'Tags');
      resolve(getVersionsFromTags(tags).map((item) => ({ ...item, directory: registryInfo.directory || '' })));
    } catch (e) {
      reject(new Error('Error getting package versions.'));      
    }
  });

  promise.cancel = () => {
    if (cancelled) return;

    cancelled = true;    
    if (rawRegistryInfoPromise) {
      rawRegistryInfoPromise.cancel();
    }
  };

  return promise;
}
