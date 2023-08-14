import {
    Disposable,
    Selection,
    TextDocument,
    TextEditor,
    Uri,
    WorkspaceFolder,
    window,
    workspace, commands,
} from "vscode";
import {randomUUID} from "crypto";
import blame from "./blame";
import {StatusBarView} from "./views/status-bar-view";
import {Document, getActiveTextEditor, getFilePosition, NO_FILE_OR_PLACE, validEditor} from "./util/vs-code";
import {WS} from "./connection/ws";
import {
    ReactionEmojis,
    ReactionAddEvent,
    StoreLineReaction,
    ReactionStatusEvent,
    Details
} from "./types/app";
import {isUncomitted} from "./util/git";
import {HeadWatch} from "./watchers/head-watch";
import {LogWatch} from "./watchers/log-watch";
import {getCurrentBranch, isCommitInCurrentBranch} from "./git/gitcommand";
import hash from "./util/hash";
import {AnnotateView} from "./views/annotate-view";
import {APP_HANDLE, EMPTY_LINE_REACTION} from "./util/constants";
import {getFileName} from "./util/file-name";
import {FeedViewProvider} from "./views/feed-view";
import {InlineView} from "./views/inline-view";
import store from "./util/store";
import {NotificationView} from "./views/notification-view";
import {configName, getProperty} from "./util/configuration";

export class App {
    private readonly disposable: Disposable;
    private readonly statusBarView: StatusBarView;
    private readonly inlineView: InlineView;
    private readonly headWatcher: HeadWatch;
    private readonly logWatcher: LogWatch;
    private ws: WS;
    public feedViewProvider: FeedViewProvider;
    private readonly annotateView: AnnotateView;
    private existingReactions: Set<string> = new Set();
    private seenReactions: Set<string> = new Set();
	private readonly configChange: Disposable;

    constructor(extensionUri: Uri) {
        const feedViewProvider = new FeedViewProvider(extensionUri);
        this.feedViewProvider = feedViewProvider;
        this.ws = new WS(this.updateView.bind(this), feedViewProvider);
        this.statusBarView = new StatusBarView();
        this.inlineView = new InlineView();
        this.headWatcher = new HeadWatch();
        this.logWatcher = new LogWatch();
        this.annotateView = new AnnotateView(this.onReactionShow.bind(this));

		this.configChange = workspace.onDidChangeConfiguration(async (event) => {
            if(event.affectsConfiguration(configName("reactionsFeedEnabled"))){
                commands.executeCommand('setContext', `${APP_HANDLE}.reactionsFeedEnabled`, getProperty('reactionsFeedEnabled'));
            }
            await Promise.all([
                this.statusBarView.onDidChangeConfiguration(event),
                this.inlineView.onDidChangeConfiguration(event),
            ]);
            await this.updateView();
		});

        this.disposable = this.setupListeners();

        this.updateView();
        this.updateFileInfo();
    }

    public dispose(): void {
        this.statusBarView.dispose();
        this.inlineView.dispose();
        this.disposable.dispose();
        blame.dispose();
        this.headWatcher.dispose();
        this.logWatcher.dispose();
		this.configChange.dispose();
    }

    private setupListeners(): Disposable {
        const changeTextEditorSelection = (textEditor: TextEditor): void => {
            const {scheme} = textEditor.document.uri;
            if (scheme === "file" || scheme === "untitled") {
                this.updateView(textEditor);
            }
        };

        this.ws.onReconnect(this.updateView.bind(this));

        this.ws.onNewReactions(async (reactions) => {
            await NotificationView.onNewReactions(reactions);
        });

        this.headWatcher.onChange(async ({repositoryRoot, head}) => {
            this.existingReactions.clear();
            blame.removeFromRepository(repositoryRoot);
            await this.logWatcher.onHeadChange(repositoryRoot, head);
        });

        this.logWatcher.onChange(async ({filePath}) => {
            this.existingReactions.clear();
            const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(filePath));
            const fileName = getFileName(workspaceFolder, filePath);
            await blame.remove(filePath);

            if (!workspaceFolder) {
                return;
            }
            const fileReactions = await this.ws.getFileReactions(workspaceFolder, fileName);
            if (fileReactions) {
                const overwritenReactions = [];
                for (const [key, value] of fileReactions.entries()) {
                    const line = parseInt(key.split('_')[1], 10);
                    const commit = key.split('_')[0];
                    const blameInfo = await blame.getBlameInfo(fileName);
                    const stillThere = (Array.from(blameInfo?.values() || [])).find(lineBlame =>
                        lineBlame?.line.source === line &&
                        lineBlame?.commit.hash === commit
                    );
                    if (!stillThere) {
                        overwritenReactions.push({fileName, reaction: value});
                    }
                }
                if (overwritenReactions.length) {
                    await this.detectOverwriteReaction(workspaceFolder, overwritenReactions);
                }

            }
        });

        return Disposable.from(
            workspace.onDidChangeWorkspaceFolders(this.ws.init),
            window.onDidChangeActiveTextEditor(async (textEditor): Promise<void> => {
                if (validEditor(textEditor)) {
                    this.statusBarView.activity();
                    blame.file(textEditor.document.fileName);
                    /**
                     * For unknown reasons files without previous or stored
                     * selection locations don't trigger the change selection
                     * event. I have not been able to find a way to detect when
                     * this happens. Running the event handler twice seames to
                     * be a good enough workaround.
                     */
                    changeTextEditorSelection(textEditor);
                } else {
                    this.statusBarView.clear();
                    this.inlineView.clear();
                }

                this.updateFileInfo(textEditor);

            }),
            window.onDidChangeTextEditorSelection(({textEditor}) => {
                changeTextEditorSelection(textEditor);
            }),
            workspace.onDidSaveTextDocument((): void => {
                this.updateView();
            }),
            workspace.onDidCloseTextDocument((document: Document): void => {
                blame.remove(document.fileName);
            }),
            workspace.onDidOpenTextDocument(async (document: TextDocument): Promise<void> => {

            }),
            workspace.onDidChangeTextDocument(async ({document, contentChanges, reason}) => {
                const textEditor = getActiveTextEditor();
                if (textEditor?.document === document) {
                    this.updateView(textEditor);
                }
            }),
        );
    }

    private async onReactionShow(workspaceFolder: WorkspaceFolder, reactions: {
        fileName: string;
        reaction: StoreLineReaction
    }[]) {
        this.detectSeenReaction(workspaceFolder, reactions)
            .catch(() => {
                // swallow error
            });
        this.detectExistingReaction(workspaceFolder, reactions)
            .catch(() => {
                // swallow error
            });
    }

    private async updateFileInfo(
        textEditor = getActiveTextEditor()
    ) {

        const document = textEditor?.document;
        if (!document) {
            return;
        }
        const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return;
        }
        await this.ws.requestDocumentReactionDetails(workspaceFolder, document);
        const fileReactions = await this.ws.getFileReactions(workspaceFolder, document.fileName);
        const commitMap: Map<string, boolean> = new Map();
        const branch = await getCurrentBranch(document.fileName);
        if (fileReactions) {
            const overwrittenReactions = [];
            for (const [key, value] of fileReactions.entries()) {
                const line = parseInt(key.split('_')[1], 10);
                const commit = key.split('_')[0];
                const blameInfo = await blame.getBlameInfo(document.fileName);
                const stillThere = (Array.from(blameInfo?.values() || [])).find(lineBlame =>
                    lineBlame?.line.source === line &&
                    lineBlame?.commit.hash === commit
                );
                if (!stillThere) {
                    if (!commitMap.has(commit)) {
                        const inCurrentBranch = await isCommitInCurrentBranch(branch, commit);
                        commitMap.set(commit, inCurrentBranch);
                    }
                    if (commitMap.get(commit)) {
                        overwrittenReactions.push({fileName: document.fileName, reaction: value});
                    }
                }
            }
            if (overwrittenReactions.length) {
                await this.detectOverwriteReaction(workspaceFolder, overwrittenReactions);
            }

        }
    }

    private async updateView(
        textEditor = getActiveTextEditor()
    ): Promise<void> {

        if (!validEditor(textEditor)) {
            this.statusBarView.clear();
            this.inlineView.clear();
            return;
        }

        const timeout = setTimeout(() => {
            if (!this.ws.ERROR) {
                this.statusBarView.clear();
                this.inlineView.clear();
                this.statusBarView.activity();
            }
        }, 50);

        const head = await this.headWatcher.addFile(textEditor.document.fileName);
        if (head) {
            this.logWatcher.addFile(textEditor.document.fileName, head);
        }

        const before = getFilePosition(textEditor);

        let linesReactions = {...EMPTY_LINE_REACTION};
        let uncommitted = true;
        let linesSelected = 0;
        let onlyLastLineSelected = false;
        let existingReactions: { fileName: string; reaction: StoreLineReaction }[] = [];

        const workspaceFolder = workspace.getWorkspaceFolder(textEditor.document.uri);

        await Promise.all(textEditor.selections.map(async selection => {
            const start = selection.start.line;
            let end = selection.end.line;

            if (end === textEditor.document.lineCount - 1 && start !== end) {
                end -= 1;
            } else if (end === textEditor.document.lineCount - 1 && start === end) {
                return onlyLastLineSelected = true;
            }

            const allLines = Array.from({length: end - start + 1}).map((_, i) => i + start);
            linesSelected += allLines.length;
            for (const line of allLines) {
                const lineAware = await blame.getLine(
                    textEditor.document.fileName,
                    line
                );

                if (lineAware && !isUncomitted(lineAware?.commit)) {
                    uncommitted = false;
                    try {
                        const newLinesReactions = await this.ws.getLineReactions(
                            workspaceFolder,
                            lineAware?.filename,
                            lineAware?.commit.hash,
                            lineAware?.line.source
                        );
                        Object.values(ReactionEmojis).forEach(key => {
                            linesReactions[key] = (linesReactions[key] || 0) + (newLinesReactions[key] || 0);
                            linesReactions[`your${key}`] = (linesReactions[`your${key}`] || 0) + (newLinesReactions[`your${key}`] || 0);
                        });
                        linesReactions.ids = newLinesReactions.ids;

                        if (newLinesReactions && newLinesReactions.ids.size > 0) {
                            existingReactions.push({
                                reaction: newLinesReactions,
                                fileName: textEditor.document.fileName
                            });
                        }

                    } catch (e) {
                        // swallow error
                    }
                }
            }
        }));

        const textEditorAfter = getActiveTextEditor();
        if (!validEditor(textEditorAfter)) {
            return;
        }

        const after = getFilePosition(textEditorAfter);

        clearTimeout(timeout);

        // Only update if we haven't moved since we started blaming
        // or if we no longer have focus on any file
        if (before === after || after === NO_FILE_OR_PLACE) {
            if (this.ws.ERROR) {
                this.statusBarView.setError();
            } else if (onlyLastLineSelected) {
                this.statusBarView.set(false, undefined, textEditor, linesSelected);
                this.inlineView.set(false, undefined, textEditor, linesSelected);
            } else {
                let details: Details[] = [];
                Array.from(linesReactions.ids).forEach(id => {
                    if (this.ws.detailsMap.has(id)) {
                        details.push(this.ws.detailsMap.get(id) as Details);
                    }
                });
                this.statusBarView.set(uncommitted, linesReactions, textEditor, linesSelected);
                this.inlineView.set(uncommitted, linesReactions, textEditor, linesSelected, details);
            }
        } else {
            return this.updateView();
        }

        if (this.annotateView.annotateIsOn) {
            const fullBlame = await blame.getBlameInfo(textEditor.document.fileName);
            const lineReactions = await this.ws.getFileReactions(workspace.getWorkspaceFolder(Uri.file(textEditor.document.fileName)), textEditor.document.fileName);
            await this.annotateView.createFileDecoration(fullBlame, lineReactions, textEditor, this.ws.detailsMap);
        } else {
            this.annotateView.removeAllDecorations();
        }

        if (existingReactions.length && workspaceFolder) {
            this.onReactionShow(workspaceFolder, existingReactions);
        }

        if (workspaceFolder) {
            const fullBlame = await blame.getBlameInfo(textEditor.document.fileName);
            this.feedViewProvider?.setBlame(workspaceFolder, textEditor.document.fileName, fullBlame);
        }

    }

    toggleAnnotations() {
        this.annotateView.toggleAnnotations();
        this.updateView();
    }

    async detectReactionStatus(
        workspaceFolder: WorkspaceFolder,
        existingReactions: {
            fileName: string; reaction: StoreLineReaction
        }[],
        status: ReactionStatusEvent['reactions'][number]['status'],
        cache?: Set<string>
    ) {

        const lineReactions: ReactionStatusEvent['reactions'] = [];
        const fileHeadMap = new Map();
        const fileCommitMap = new Map();

        await Promise.all(existingReactions.map(async ({fileName, reaction}) => {
            const ids = Array.from(reaction.ids).filter(id => !cache?.has(id));
            if (ids.length === 0) {
                return;
            }
            if (!fileHeadMap.has(fileName)) {
                const fileHead = await this.headWatcher.getFileHead(fileName);
                fileHeadMap.set(fileName, fileHead);
            }
            if (!fileCommitMap.has(fileName)) {
                const commit = await this.logWatcher.getCommit(fileName);
                fileCommitMap.set(fileName, commit);
            }

            const fileCommit = fileCommitMap.get(fileName);
            if (!fileCommit || Object.keys(fileCommit).length === 0) {
                return;
            }

            Array.from(ids).forEach(id => {
                lineReactions.push({
                    id,
                    status,
                    branch: fileHeadMap.get(fileName),
                    sha: fileCommit.sha as string,
                    datetime: fileCommit.datetime as string,
                    author_email_sha: hash.getEmailHash(fileCommit.author_email as string),
                    author_name: fileCommit.author_name as string
                });
            });
        }));
        if (lineReactions.length > 0) {
            if (cache) {
                lineReactions.forEach(reaction => {
                    cache.add(reaction.id);
                });
            }
            await this.ws.enqueue(workspaceFolder, {
                action: 'reaction-status',
                reactions: lineReactions
            });
        }
    }

    async detectSeenReaction(workspaceFolder: WorkspaceFolder,
                             seenReactions: {
                                 fileName: string; reaction: StoreLineReaction
                             }[]
    ) {

        return this.detectReactionStatus(workspaceFolder, seenReactions, 'seen', this.seenReactions);
    }

    async detectExistingReaction(
        workspaceFolder: WorkspaceFolder,
        existingReactions: {
            fileName: string; reaction: StoreLineReaction
        }[]
    ) {

        return this.detectReactionStatus(workspaceFolder, existingReactions, 'existing', this.existingReactions);
    }

    async detectOverwriteReaction(
        workspaceFolder: WorkspaceFolder,
        removedReactions: {
            fileName: string; reaction: StoreLineReaction
        }[]
    ) {

        return this.detectReactionStatus(workspaceFolder, removedReactions, 'overwrite');
    }

    registerReactionWithContent(emoji: ReactionEmojis) {
        return async () => {
            const content = await window.showInputBox({
                title: 'Add your comment for this reaction'
            });

            if (content === undefined) {
                return;
            }

            const textEditor = getActiveTextEditor();
            if (textEditor) {
                const workspaceFolder = workspace.getWorkspaceFolder(textEditor?.document.uri);
                if (workspaceFolder) {
                    await this.registerReaction(textEditor.document, workspaceFolder, textEditor.selections, emoji, content === '' ? undefined : content);
                }
            }
        };
    }

    async registerReaction(
        document: TextDocument,
        workspaceFolder: WorkspaceFolder,
        selections: readonly Selection[],
        type: ReactionEmojis,
        content?: string
    ) {
        const lineReactions: Omit<ReactionAddEvent['reactions'][number], 'id'>[] = [];
        const reaction_group_id = randomUUID();
        await Promise.all(selections.map(async selection => {
            const start = selection.start.line;
            let end = selection.end.line;

            if (end === document.lineCount - 1 && start !== end) {
                end -= 1;
            } else if (end === document.lineCount - 1 && start === end) {
                return;
            }


            const allLines = Array.from({length: end - start + 1}).map((_, i) => i + start);
            await Promise.all(allLines.map(async line => {
                const lineAware = await blame.getLine(
                    document.fileName,
                    line,
                );
                const fileHead = await this.headWatcher.getFileHead(document.fileName);
                const fileCommit = await this.logWatcher.getCommit(document.fileName);
                const projectId = store.workspaceInfo.get(hash.getWorkspaceLocationHash(workspaceFolder.uri.fsPath))?.id;
                if (lineAware && projectId) {
                    lineReactions.push({
                        project_id: projectId,
                        reaction_action: "add",
                        type,
                        branch: fileHead,
                        content,
                        current_sha: fileCommit.sha as string,
                        current_line: lineAware.line.result,
                        current_datetime: fileCommit.datetime as string,
                        original_sha: lineAware.commit.hash,
                        original_line: lineAware.line.source,
                        original_timestamp: lineAware.commit.author.timestamp || lineAware.commit.committer.timestamp,
                        author_email_sha: hash.getEmailHash(lineAware.commit.author.mail),
                        author_name: lineAware.commit.author.name,
                        committer_email_sha: hash.getEmailHash(lineAware.commit.committer.mail),
                        committer_name: lineAware.commit.committer.name,
                        file_name: lineAware?.filename,
                        language: document.languageId,
                        reaction_group_id
                    });
                }
            }));
        }));
        if (lineReactions.length > 0) {
            await this.ws.enqueue(workspaceFolder, {
                action: 'reaction',
                reactions: lineReactions
            });
            if (this.statusBarView.showingMore) {
                this.statusBarView.toggleShowMore();
            }
        }
    }
}
