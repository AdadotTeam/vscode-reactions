import { dirname, resolve } from "node:path";
import { getCurrentBranch, getGitFolder } from "../git/gitcommand";
import { workspace, RelativePattern, FileSystemWatcher } from "vscode";

export type HeadChangeEvent = {
	gitRoot: string;
	repositoryRoot: string;
	filePath: string;
	head: string;
};

type HeadChangeEventCallbackFunction = (event: HeadChangeEvent) => void;
type HeadChangeEventCallbackFunctionInternal = (event: Omit<HeadChangeEvent, 'head'>) => void;

export class HeadWatch {
	public readonly heads: Map<string, FileSystemWatcher> = new Map();
	private readonly filesWithFoundHeads: Map<string, string> = new Map();
	private callback: HeadChangeEventCallbackFunctionInternal = () => undefined;

	private async renewFileHead(filePath: string) {
		const head = await getCurrentBranch(filePath);

		this.filesWithFoundHeads.set(filePath, head);
	}

	public async getFileHead(filePath: string): Promise<string>{
		if (this.filesWithFoundHeads.has(filePath)) {
			return this.filesWithFoundHeads.get(filePath) as string;
		}
		await this.addFile(filePath);
		return this.filesWithFoundHeads.get(filePath) as string;
	}

	public onChange(callback: HeadChangeEventCallbackFunction): void {
		this.callback = async (params)=> {
			await this.renewFileHead(params.filePath);
			const head = this.filesWithFoundHeads.get(params.filePath);
			callback({...params, head: head as string});
		};
	}

	public async addFile(filePath: string): Promise<string | undefined> {
		if (this.filesWithFoundHeads.has(filePath)) {
			return this.filesWithFoundHeads.get(filePath);
		}

		await this.renewFileHead(filePath);

		const relativeGitRoot = await getGitFolder(filePath);
		const gitRoot = this.normalizeWindowsDriveLetter(
			resolve(dirname(filePath), relativeGitRoot),
		);
		const watched = this.heads.has(gitRoot);

		if (watched === true || relativeGitRoot === "") {
			return this.filesWithFoundHeads.get(filePath);
		}

		const repositoryRoot = resolve(gitRoot, "..");
		const headFile = resolve(gitRoot, "HEAD");

		const watcher = workspace.createFileSystemWatcher(
			new RelativePattern(headFile, '*')
		);

		watcher.onDidChange(()=>{
			this.callback({ gitRoot, repositoryRoot, filePath });
		});

		this.heads.set(gitRoot, watcher);
		return this.filesWithFoundHeads.get(filePath);
	}

	public dispose(): void {
		for (const [, headWatcher] of this.heads) {
			headWatcher.dispose();
		}
		this.callback = () => undefined;
	}

	private normalizeWindowsDriveLetter(path: string): string {
		return path[0].toLowerCase() + path.substr(1);
	}
}
