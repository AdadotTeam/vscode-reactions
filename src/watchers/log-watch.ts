import { dirname, resolve } from "node:path";
import { getCurrentCommit, getGitFolder } from "../git/gitcommand";
import { workspace, RelativePattern, FileSystemWatcher } from "vscode";
import { LatestCommitInfo } from "../types/git";

export type LogChangeEvent = {
	gitRoot: string;
	repositoryRoot: string;
	filePath: string;
};

type LogChangeEventCallbackFunction = (event: LogChangeEvent) => void;

export class LogWatch {
	public readonly rootToFiles: Map<string, Set<string>> = new Map();
	public readonly logs: Map<string, FileSystemWatcher> = new Map();
	private readonly filesWithFoundLogs: Map<string, LatestCommitInfo> = new Map();
	private callback: LogChangeEventCallbackFunction = () => undefined;
	private debounce: Map<string, boolean> = new Map();

	public async getCommit(filePath: string): Promise<LatestCommitInfo>{
		if(this.filesWithFoundLogs.has(filePath)){
			return this.filesWithFoundLogs.get(filePath) as LatestCommitInfo;
		}
		const commit = await getCurrentCommit(filePath);
		return commit as LatestCommitInfo;

	}


	private async renewFileLog(filePath: string) {
		const commit = await getCurrentCommit(filePath);

		if(commit.sha){
			this.filesWithFoundLogs.set(filePath, commit);
		}
	}

	public onChange(callback: LogChangeEventCallbackFunction): void {
		this.callback = async (params)=> {
			const previousCommit = this.filesWithFoundLogs.get(params.filePath);
			const currentCommit = await getCurrentCommit(params.filePath);
			if(currentCommit.sha && previousCommit !== currentCommit.sha){
				this.filesWithFoundLogs.set(params.filePath, currentCommit);
				callback(params);
			}
		};
	}

	public async onHeadChange(repositoryRoot:string, head: string): Promise<void> {
		await Promise.all(
			Array.from(this.rootToFiles.get(repositoryRoot) || []).map(filePath=>{
				this.logs.get(filePath)?.dispose();
				this.logs.delete(filePath);
				this.filesWithFoundLogs.delete(filePath);
				this.addFile(filePath, head);
			})
		);
	}

	public async addFile(filePath: string, head: string): Promise<void> {
		if (this.filesWithFoundLogs.has(filePath)) {
			return;
		}

		await this.renewFileLog(filePath);

		const relativeGitRoot = await getGitFolder(filePath);
		const gitRoot = this.normalizeWindowsDriveLetter(
			resolve(dirname(filePath), relativeGitRoot),
		);
		const watched = this.logs.has(filePath);

		if (watched === true || relativeGitRoot === "") {
			return;
		}

		const repositoryRoot = resolve(gitRoot, "..");
		const logFile = resolve(gitRoot, "logs", "refs", "heads", head);

		const watcher = workspace.createFileSystemWatcher(
			new RelativePattern(logFile, '*')
		);

		watcher.onDidChange((e)=>{
			if(!this.debounce.get(filePath)){
				this.debounce.set(filePath, true);
				setTimeout(()=>{
					this.callback({ gitRoot, repositoryRoot, filePath });

					this.debounce.set(filePath, false);
				}, 100);
			}
		});

		this.logs.set(filePath, watcher);
		if(this.rootToFiles.has(repositoryRoot)){
			this.rootToFiles.get(repositoryRoot)?.add(filePath);
		}else{
			this.rootToFiles.set(repositoryRoot, new Set<string>(filePath));
		}
		
	}

	public dispose(): void {
		for (const [, logWatcher] of this.logs) {
			logWatcher.dispose();
		}
		this.callback = () => undefined;
	}

	private normalizeWindowsDriveLetter(path: string): string {
		return path[0].toLowerCase() + path.substr(1);
	}
}
