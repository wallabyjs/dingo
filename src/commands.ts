import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as validateNpmPackageName from 'validate-npm-package-name';
import * as vscode from 'vscode';

import { CancellablePromise } from './CancellablePromise';
import { Commit, download, getBranchesOrTags, getDefaultDownloadDirectory, getRepoShortName } from './git';
import { getCurrentPackageVersion, getPackageVersions } from './npm';
import { installPackages } from './packages';

const notSupportedSourceErrorMessage = `The entered value doesn't look like a package name or a URL`;

type PromptType = 'Always' | 'Prompt' | 'Never';

interface DingoSettings {
  automaticallyInstall: PromptType;
  automaticallyOpen: PromptType;
  directory: string;
  gitPath: string;
  npmPath: string;
  yarnPath: string;
}

enum SourceType {
  gitRepo,
  npmPackage,
  notSupported,
}

function determineSourceType(input: string | undefined): SourceType {
  if (input) {
    if (input.toLowerCase().startsWith('https://github.com/') && !input.trim().endsWith('.git')) {
      input = input + '.git';
    }

    if (input.trim().endsWith('.git')) {
      return SourceType.gitRepo;
    }

    const packageNameValidationResult = validateNpmPackageName(input);
    if (packageNameValidationResult.validForNewPackages || packageNameValidationResult.validForOldPackages) {
      return SourceType.npmPackage;
    }
  }

  return SourceType.notSupported;
}

enum BranchCommit {
  default,
  tag,
  branch,
}

interface BranchCommitQuickPickItem extends vscode.QuickPickItem {
  type: BranchCommit;
}

async function selectBranchAndCommit(repoUrl: string): Promise<Commit | undefined> {
  const selectedItem = await vscode.window.showQuickPick<BranchCommitQuickPickItem>([
    {
      label: 'default branch (e.g. main / master)',
      type: BranchCommit.default,
    },
    {
      label: 'select tag',
      type: BranchCommit.tag,
    },
    {
      label: 'select different branch',
      type: BranchCommit.branch,
    },
  ]);

  if (!selectedItem) {
    return;
  }

  switch (selectedItem.type) {
    case BranchCommit.default:
      return {
        label: '',
        repoUrl,
        directory: '',
      };

    case BranchCommit.tag:
      return await selectBranchOrTag(repoUrl, 'Tags');

    case BranchCommit.branch:
      return await selectBranchOrTag(repoUrl, 'Branches');

    default:
      throw new Error('Unknown option');
  }
}

function completionQuickPickOptions(
  automaticallyInstall: PromptType,
  automaticallyOpen: PromptType
): {
  placeholder: string;
  items: Array<{
    label: string;
    automaticallyInstall: boolean;
    automaticallyOpen: boolean;
    updateSettings: boolean;
  }>;
} {
  if (automaticallyInstall === 'Prompt' && automaticallyOpen === 'Prompt') {
    return {
      placeholder: 'Select action to take when repository download has finished...',
      items: [
        { label: 'Do nothing', automaticallyInstall: false, automaticallyOpen: false, updateSettings: false },
        { label: 'Open folder', automaticallyInstall: false, automaticallyOpen: true, updateSettings: false },
        { label: 'Install packages and open folder', automaticallyInstall: true, automaticallyOpen: true, updateSettings: false },
        { label: 'ALWAYS open folder', automaticallyInstall: false, automaticallyOpen: true, updateSettings: true },
        { label: 'ALWAYS install packages and open folder', automaticallyInstall: true, automaticallyOpen: true, updateSettings: true },
      ],
    };
  } else if (automaticallyInstall === 'Prompt') {
    return {
      placeholder: 'Do you want to install packages when download has finished?',
      items: [
        { label: 'No, do not install packages', automaticallyInstall: false, automaticallyOpen: automaticallyOpen === 'Always', updateSettings: false },
        { label: 'Yes, install packages', automaticallyInstall: true, automaticallyOpen: automaticallyOpen === 'Always', updateSettings: false },
        {
          label: 'Yes, and update my settings to always automatically install packages',
          automaticallyInstall: true,
          automaticallyOpen: automaticallyOpen === 'Always',
          updateSettings: true,
        },
      ],
    };
  } else {
    return {
      placeholder: 'Do you want to open the repository when the download has finished?',
      items: [
        { label: 'No, do not open the repository', automaticallyInstall: automaticallyInstall === 'Always', automaticallyOpen: false, updateSettings: false },
        { label: 'Yes, open the repository', automaticallyInstall: automaticallyInstall === 'Always', automaticallyOpen: true, updateSettings: false },
        { label: 'Yes, update my settings to always automatically open', automaticallyInstall: automaticallyInstall === 'Always', automaticallyOpen: true, updateSettings: true },
      ],
    };
  }
}

async function getDirectoryToDownloadTo(root: string, repoUrl: string): Promise<string | undefined> {
  const directory = getDefaultDownloadDirectory(root, repoUrl);

  if (fs.existsSync(directory)) {
    const directoryOption = await vscode.window.showQuickPick([
      { label: 'Open existing directory (do not download repository)', openExisting: true },
      { label: 'Download to a new directory', new: true },
      { label: 'Download and overwrite existing directory (WARNING: any changes will be lost)', overwrite: true },
    ], {
      placeHolder: 'Repository directory already exists. How would you like to proceed?',
    });    

    if (!directoryOption) {
      return undefined;
    }

    if (directoryOption.overwrite) {
      return directory;
    } else if (directoryOption.openExisting) {
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(directory), true);
      return undefined;
    } else if (directoryOption.new) {
      let i = 1;
      do {
        i++;
      } while (fs.existsSync(directory + '-' + i.toString()));
      return directory + '-' + i.toString();
    }
  }

  return directory;
}

async function showCompletionOptions(
  automaticallyInstall: PromptType,
  automaticallyOpen: PromptType
): Promise<{ automaticallyInstall: boolean; automaticallyOpen: boolean } | undefined> {
  const completionOptions = completionQuickPickOptions(automaticallyInstall, automaticallyOpen);

  const selectedItem = await vscode.window.showQuickPick(completionOptions.items, {
    placeHolder: completionOptions.placeholder,
  });

  if (!selectedItem) {
    return;
  }

  if (selectedItem.updateSettings) {
    const dingoConfig = vscode.workspace.getConfiguration('dingo');
    if (selectedItem.automaticallyInstall) {
      dingoConfig.set('automaticallyInstall', 'Always');
    }
    if (selectedItem.automaticallyOpen) {
      dingoConfig.set('automaticallyOpen', 'Always');
    }
  }

  return selectedItem;
}

async function showQuickPick(input: string, loadedValue: string, busyPlaceholder: string, loadedPlaceholder: string, noItemsMessage: string, loadItems: () => Promise<Commit[]>) {
  return new Promise<Commit | undefined>(async (resolve) => {
    const quickPick = vscode.window.createQuickPick();

    let visible = true;

    quickPick.show();

    quickPick.placeholder = busyPlaceholder;

    quickPick.onDidChangeValue(() => {
      if (quickPick.busy) {
        quickPick.value = '';
      }
    });

    quickPick.onDidAccept(() => {
      return resolve(quickPick.selectedItems[0] as Commit);
    });

    quickPick.onDidHide(() => {
      visible = false;
      return resolve(undefined);
    });

    quickPick.busy = true;

    try {
      const commits = await loadItems();
      if (visible) {
        if (!commits.length) {
          quickPick.hide();
          throw new Error(noItemsMessage);
        } else {
          quickPick.placeholder = loadedPlaceholder;
          quickPick.items = commits;
          quickPick.value = loadedValue;
          quickPick.busy = false;
        }
      }
    } catch (e:any) {
      console.error(e);
      quickPick.hide();
      if (e.message) {
        openHandler(input, e.message);
      } else {
        openHandler(input, 'Unexpected Error');
      }
      return;
    }
  });
}

async function selectBranchOrTag(repoUrl: string, requestType: 'Branches' | 'Tags'): Promise<Commit | undefined> {
  return showQuickPick(
    repoUrl,
    '',
    `Loading ${requestType === 'Branches' ? 'branches' : 'tags'}...`,
    `Select ${requestType === 'Branches' ? 'branch' : 'tag'} to open`,
    `No ${requestType === 'Branches' ? 'branches' : 'tags'} found`,
    async () => {
      const settings = (vscode.workspace.getConfiguration('dingo') as any) as DingoSettings;
      return await getBranchesOrTags(settings.gitPath, repoUrl, requestType);
    }
  );
}

async function selectPackageVersionCommit(packageName: string): Promise<Commit | undefined> {
  const currentVersion = getCurrentPackageVersion(vscode.workspace.rootPath, packageName);

  return showQuickPick(
    packageName,
    currentVersion,
    `Loading package details...`,
    `Select version to open`,
    `No package versions found`,
    async () => {
      const settings = (vscode.workspace.getConfiguration('dingo') as any) as DingoSettings;
      return await getPackageVersions(settings.gitPath, packageName);
    }
  );
}

async function openDialogToGetCommitDetails(value: string, sourceType: SourceType): Promise<Commit | undefined> {
  switch (sourceType) {
    case SourceType.gitRepo:
      return await selectBranchAndCommit(value);
      break;

    case SourceType.npmPackage:
      return await selectPackageVersionCommit(value);
      break;
  }

  return undefined;
}

async function downloadRepository(inputValue: string, commit: Commit) {
  const settings = (vscode.workspace.getConfiguration('dingo') as any) as DingoSettings;

  const shortName = getRepoShortName(commit.repoUrl);
  const directoryName = await getDirectoryToDownloadTo(settings.directory || tmpdir(), commit.repoUrl);

  if (!directoryName) {
    return;
  }

  let automaticallyOpen = settings.automaticallyOpen === 'Always';
  let automaticallyInstall = settings.automaticallyOpen === 'Prompt';
  if (settings.automaticallyInstall === 'Prompt' || settings.automaticallyOpen === 'Prompt') {
    const confirmationOptions = await showCompletionOptions(settings.automaticallyInstall, settings.automaticallyOpen);
    if (!confirmationOptions) {
      return;
    }

    automaticallyOpen = confirmationOptions.automaticallyOpen;
    automaticallyInstall = confirmationOptions.automaticallyInstall;
  }

  const progressStartTime = new Date().getTime();

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: shortName,
      cancellable: true,
    },
    (progress, token) => {
      let cancelled = false;
      let waitingPromise: CancellablePromise<void> | undefined = undefined;
      token.onCancellationRequested(() => {
        cancelled = true;
        if (waitingPromise) {
          waitingPromise.cancel();
        }
      });

      return new Promise<void>(async (resolve) => {
        progress.report({ message: 'Downloading...' });
        try {
          waitingPromise = download(settings.gitPath, commit, directoryName);
          await waitingPromise;
          waitingPromise = undefined;

          if (!cancelled) {
            if (automaticallyInstall) {
              progress.report({ message: 'Installing packages...' });
              waitingPromise = installPackages(directoryName, settings.npmPath, settings.yarnPath);
              await waitingPromise;
              waitingPromise = undefined;
            }

            if (!cancelled && automaticallyOpen) {
              vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(commit!.directory ? path.join(directoryName, commit!.directory) : directoryName), true);
            }
          }
        } catch (e:any) {
          console.error(e);
          if (!cancelled) {
            const timeSinceProgressStarted = new Date().getTime() - progressStartTime;
            if (timeSinceProgressStarted < 2500) {
              openHandler(inputValue, e.message);
            } else {
              vscode.window.showErrorMessage('An error occurred retrieving repository: ' + e.message);
            }  
          }
        }
        resolve();
      });
    }
  );
}

export async function openHandler(value: string, errorMessage?: string) {
  const input = vscode.window.createInputBox();

  input.prompt = 'Provide URL or package name';
  input.ignoreFocusOut = true;

  if (value) {
    input.value = value;
  }

  if (errorMessage) {
    input.validationMessage = 'ERROR: ' + errorMessage;
  }

  input.onDidChangeValue((value) => {
    if (value && determineSourceType(value) === SourceType.notSupported) {
      input.validationMessage = notSupportedSourceErrorMessage;
    } else {
      input.validationMessage = undefined;
    }
  });

  input.onDidAccept(async () => {
    if (!input.value) { return; }

    const sourceType = determineSourceType(input.value);
    if (sourceType === SourceType.notSupported) { return; }

    input.hide();

    const commit = await openDialogToGetCommitDetails(input.value, sourceType);
    if (!commit) { return; }

    downloadRepository(input.value, commit);
  });
  input.show();
}
