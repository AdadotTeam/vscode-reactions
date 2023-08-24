import { Uri } from "vscode";
import { getTopLevelLocalRepoDirectory, getUserInfo } from "../git/gitcommand";
import { Repo } from "./repo";
import { UserInfo } from "../types/git";

class FileInfo {
    private filePathToRepoPath: Map<string, Repo> = new Map();
    private rootPathToRepo: Map<string, Repo> = new Map();
    private filePathToUserInfo: Map<string, UserInfo> = new Map();

    async getUserInfo(filePath: string): Promise<UserInfo | undefined>{
        if(this.filePathToUserInfo.has(filePath)){
            return this.filePathToUserInfo.get(filePath);
        }
        const userInfo = await getUserInfo(filePath);
        if(userInfo) {
            this.filePathToUserInfo.set(filePath, userInfo);
        }
        return this.filePathToUserInfo.get(filePath);
    }

    async getRepoFromFilePath(filePath: string):Promise<Repo | undefined> {
        if(this.filePathToRepoPath.has(filePath)){
            return this.filePathToRepoPath.get(filePath);
        }
        const rootFolder = await getTopLevelLocalRepoDirectory(filePath);
        if(!rootFolder) {
            return undefined;
        }
        if(this.rootPathToRepo.has(rootFolder)){
            const foundRepo = this.rootPathToRepo.get(rootFolder) as Repo;
            this.filePathToRepoPath.set(filePath, foundRepo);
            return foundRepo;
        }

        const repo = await Repo.getFromRoot(rootFolder);
        if(repo) {
            this.filePathToRepoPath.set(filePath, repo);
            this.rootPathToRepo.set(rootFolder, repo);
        }
        return this.filePathToRepoPath.get(filePath);
    }

    getRepoFromFileUri(fileUri: Uri):Promise<Repo | undefined> {
        return this.getRepoFromFilePath(fileUri.fsPath);
    }

    getRepos() {
        return Array.from(this.rootPathToRepo.values());
    }

}

const fileInfo = new FileInfo();

export default fileInfo;

