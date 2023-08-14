import {ChildProcess} from "node:child_process";
import {realpath} from "node:fs/promises";
import {relative} from "node:path";
import {LineAttatchedCommit} from "../types/app";
import {Logger} from "../util/logger";
import {blameProcess} from "./gitcommand";
import {processStderr, processStdout} from "../util/std-process";
import {TextDocument, workspace} from "vscode";
import {createHash} from "node:crypto";


export type Blame = Map<number, LineAttatchedCommit | undefined>;

export class File {
    private process?: ChildProcess;
    private killed = false;
    private contentMd5?: string;
    private blameInfo: Blame = new Map();
    private blaming: boolean = false;

    public constructor(private readonly fileName: string) {
    }

    public async getBlame(): Promise<Blame | undefined> {
        await this.blame();
        return this.blameInfo;
    }

    public dispose(): void {
        this.process?.kill();
        this.killed = true;
    }

    private async* run(
        realFileName: string,
        document: TextDocument
    ): AsyncGenerator<LineAttatchedCommit> {

        this.process = blameProcess(realFileName, document.isDirty ? document.getText() : undefined);

        yield* processStdout(this.process?.stdout);
        await processStderr(this.process?.stderr);
    }

    private sleep() {
        return new Promise((res) => {
            setTimeout(() => {
                res(undefined);
            }, 50);
        });
    }

    private async blame(): Promise<Blame | undefined> {
        if (this.blaming) {
            await this.sleep();
            return this.blame();
        }
        this.blaming = true;
        const realpathFileName = await realpath(this.fileName);

        const document = await workspace.openTextDocument(realpathFileName);
        const documentText = document.getText();
        const contentMd5 = createHash('md5').update(documentText).digest('hex');
        if (contentMd5 === this.contentMd5) {
            this.blaming = false;
            return this.blameInfo;
        }


        try {
            for await (const lineAttatchedCommit of this.run(realpathFileName, document)) {
                this.blameInfo.set(lineAttatchedCommit.line.result, lineAttatchedCommit);
            }
        } catch (err) {
            Logger.error(err);
            this.dispose();
        }

        this.blaming = false;

        // Don't return partial git blame info when terminating a blame
        if (!this.killed) {
            if (relative(this.fileName, realpathFileName)) {
                Logger.info(
                    `Blamed "${realpathFileName}" (resolved via symlink from "${this.fileName}")`,
                );
            } else {
                Logger.info(`Blamed "${realpathFileName}"`);
            }
            this.contentMd5 = contentMd5;
            return this.blameInfo;
        }
    }
}
