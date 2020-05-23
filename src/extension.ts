import * as vscode from 'vscode';

import { openHandler } from './commands';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('dingo-vscode.open', openHandler));
}

export function deactivate() {}
