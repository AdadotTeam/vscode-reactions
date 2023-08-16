import { Uri } from "vscode";
import { getGitFolder } from "../git/gitcommand";
import { isAbsolute, resolve } from "path";

export class Repo {
    
    root: Uri;
    gitRoot: Uri;

    private constructor(root: Uri, gitRoot: Uri) {
        this.root = root;
        this.gitRoot = gitRoot;
    }

    static async getFromRoot(rootPath: string) {
        const gitRootPathPartial = await getGitFolder(rootPath);
        const gitRootPath = isAbsolute(gitRootPathPartial) ? gitRootPathPartial : resolve(rootPath, gitRootPathPartial);
        return new Repo(Uri.file(rootPath), Uri.file(gitRootPath));
    }
}