import {promises} from "node:fs";
import {Blame, File} from "./git/file";
import {LineAttachedCommit} from "./types/app";
import {isGitTracked} from "./git/gitcommand";
import {Logger} from "./util/logger";

type Files =
    | undefined
    | File;

class Blamer {
    private readonly files = new Map<string, Files>();

    public async file(fileName: string): Promise<Blame | undefined> {
        return this.get(fileName);
    }

    public async getLine(
        fileName: string,
        lineNumber: number,
    ): Promise<LineAttachedCommit | undefined> {
        const commitLineNumber =
            lineNumber + 1;
        const blameInfo = await this.get(fileName);
        return blameInfo?.get(commitLineNumber);
    }

    public async getBlameInfo(
        fileName: string
    ): Promise<Blame | undefined> {
        return await this.get(fileName);
    }

    public removeFromRepository(gitRepositoryPath: string): void {
        for (const [fileName] of this.files) {
            if (fileName.startsWith(gitRepositoryPath)) {
                this.remove(fileName);
            }
        }
    }

    public async remove(fileName: string): Promise<void> {
        (await (await this.files.get(fileName)))?.dispose();
        this.files.delete(fileName);
    }

    public dispose(): void {
        for (const [fileName] of this.files) {
            this.remove(fileName);
        }
    }

    private async get(fileName: string): Promise<Blame | undefined> {
        if (!this.files.has(fileName)) {
            const file = await this.create(fileName);
            this.files.set(fileName, file);
        }

        const file1 = this.files.get(fileName);
        return file1?.getBlame();
    }

    public async isTracked(fileName: string): Promise<boolean> {
        if (!this.files.has(fileName)) {
            const file = await this.create(fileName);
            this.files.set(fileName, file);
        }

        return !!this.files.get(fileName);
    }

    private async create(fileName: string): Promise<File | undefined> {
        try {
            await promises.access(fileName);

            const isTracked = await isGitTracked(fileName);

            if (isTracked) {
                return new File(fileName);
            }
        } catch {
            // NOOP
        }

        Logger.info(`Will not blame '${fileName}'. Outside the current workspace.`);
    }
}

const blame = new Blamer();
export default blame;
