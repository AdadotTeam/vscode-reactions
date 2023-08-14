import { WorkspaceFolder } from "vscode";
import * as path from "node:path";

export const getFileName = (workspaceFolder: WorkspaceFolder | undefined, filePath: string) => {
    const a = path.relative(workspaceFolder?.uri.fsPath + '/', filePath);
    return a.split(path.sep).join('/');
};