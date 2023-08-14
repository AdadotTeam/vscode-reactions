import {TextDocument, WorkspaceFolder, workspace, commands} from "vscode";
import {WebSocket} from "ws";
import {
    getCurrentBranch,
    getCurrentCommit,
    getDefaultBranchName,
    getRemoteUrl,
    getUserInfo,
    validateReadAccess
} from "../git/gitcommand";
import {basename} from "path";
import {
    ProjectInfoResponse,
    ProjectOpenEvent,
    ProjectReactionsInitialResponse,
    ProjectReactionsResponse,
    ReactionEmojis,
    StoreLineReaction,
    yourEmoji,
    ReactionStatusEvent,
    NewReactionAddEvent,
    ValueOf,
    ReactionDetailsRequest,
    DetailsResponse,
    Details
} from "../types/app";
import hash from "../util/hash";
import {APP_HANDLE, EMPTY_LINE_REACTION} from "../util/constants";
import {getFileName} from "../util/file-name";
import {FeedViewProvider} from "../views/feed-view";
import store from "../util/store";
import {getProperty} from "../util/configuration";

export type NewReactionEvent = ProjectReactionsResponse['reactions'];

type NewReactionEventCallbackFunction = (event: NewReactionEvent) => void;

export class WS {
    private activeWorkspaceEmailMapping = new Map<string, string>();
    private activeSockets = new Map<string, WebSocket>();
    private lineReactions = new Map<string, StoreLineReaction>();
    private reactions = new Map<string, typeof this.lineReactions>();
    private lineReactionsTemp = new Map<string, StoreLineReaction>();
    private reactionsTemp = new Map<string, typeof this.lineReactionsTemp>();
    public detailsMap = new Map<string, Details>();
    private WS_INIT = false;
    public OPEN = false;
    public ERROR = false;
    private USE_TEMP = false;
    private readonly updateAppViewCallback: any;
    private feedViewProvider: FeedViewProvider;

    private onNewReactionCallback: NewReactionEventCallbackFunction = () => undefined;
    private onReconnectCallback: () => void = () => undefined;

    constructor(updateAppViewCallback: any, feedViewProvider: FeedViewProvider) {
        this.feedViewProvider = feedViewProvider;
        this.init();
        this.updateAppViewCallback = updateAppViewCallback;
    }

    async getLineReactions(workspaceFolder?: WorkspaceFolder, fileName?: string, originalSha?: string, originalLine?: number): Promise<StoreLineReaction> {
        if (!workspaceFolder || !fileName || !originalSha || !originalLine) {
            return {...EMPTY_LINE_REACTION};
        }

        await this.waitForDataInit(workspaceFolder);

        const projectId = store.workspaceInfo.get(hash.getWorkspaceLocationHash(workspaceFolder.uri.fsPath))?.id;
        const lineReactions = this.USE_TEMP ? this.reactionsTemp.get(`${projectId}-${fileName}`) : this.reactions.get(`${projectId}-${fileName}`);
        if (!lineReactions) {
            return {...EMPTY_LINE_REACTION};
        }

        return lineReactions.get(`${originalSha}_${originalLine}`) || {...EMPTY_LINE_REACTION};
    }

    async getFileReactions(workspaceFolder: WorkspaceFolder | undefined, fileName: string): Promise<Map<string, StoreLineReaction> | undefined> {
        if (!workspaceFolder) {
            return undefined;
        }
        await this.waitForDataInit(workspaceFolder);
        const projectId = store.workspaceInfo.get(hash.getWorkspaceLocationHash(workspaceFolder.uri.fsPath))?.id;
        return this.reactions.get(`${projectId}-${getFileName(workspaceFolder, fileName)}`);
    }

    private async requestDetails(ws: WebSocket, newIds: string[]) {
        if (newIds.length) {
            const reactionContentRequest: ReactionDetailsRequest = {
                action: "reaction-details",
                reactions: newIds.map(id => ({id}))
            };
            await this.enqueueWithWs(ws, reactionContentRequest);
        }
    }

    public async requestDocumentReactionDetails(workspaceFolder: WorkspaceFolder | undefined, textDocument: TextDocument) {
        if (!workspaceFolder) {
            return;
        }
        const fileReactions = await this.getFileReactions(workspaceFolder, textDocument.fileName);
        const newIds: string[] = [];
        Array.from(fileReactions?.values() || []).forEach(reactions => {
            reactions.ids.forEach(id => {
                if (!this.detailsMap.has(id)) {
                    newIds.push(id);
                }
            });
        });

        if (newIds.length) {
            const reactionContentRequest: ReactionDetailsRequest = {
                action: "reaction-details",
                reactions: newIds.map(id => ({id}))
            };
            await this.enqueue(workspaceFolder, reactionContentRequest);
        }
    }

    open(folder: WorkspaceFolder, emailHash: string, retries: number = 0) {
        const ws = new WebSocket(`ws://localhost:3003?email_hash=${emailHash}`);
        // const ws = new WebSocket(`wss://t65omwlbx9.execute-api.eu-west-1.amazonaws.com/sit?email_hash=${emailHash}`);
        this.activeSockets.set(emailHash, ws);

        const reconnect = () => {
            setTimeout(() => {
                if (!this.ERROR) {
                    this.open.bind(this)(folder, emailHash);
                }
            }, 50);
        };

        ws.on('error', (e) => {
            this.ERROR = true;
            commands.executeCommand('setContext', `${APP_HANDLE}.initialized`, false);
            setTimeout(() => {
                this.open(folder, emailHash, retries + 1);
            }, 10000 * retries);
            console.error(e);
        });

        ws.on('open', () => {
            this.OPEN = true;
            this.ERROR = false;
            this.onReconnectCallback();
            commands.executeCommand('setContext', `${APP_HANDLE}.initialized`, true);
            console.log('open');
        });

        ws.on('close', () => {
            reconnect();
        });

        ws.on('message', async (data: string) => {
            const parsedData = JSON.parse(data);
            // init-reactions
            // reactions
            if (parsedData.type === 'projects') {
                const projects = (parsedData as ProjectInfoResponse).projects;
                projects.forEach(project => {
                    store.workspaceInfo.set(project.location_hash, project);
                });
            } else if (parsedData.type === 'init-reactions') {
                const projectIdFiles: string[] = [];
                const reactions = (parsedData as ProjectReactionsInitialResponse).reactions;
                const newIds: string[] = [];
                reactions.forEach(reaction => {
                    reaction.ids.forEach(id => {
                        if (!this.detailsMap.has(id)) {
                            newIds.push(id);
                        }
                    });
                    const lineReaction: StoreLineReaction = {
                        ids: new Set(reaction.ids),
                        ...Object.values(ReactionEmojis).reduce((acc, v) => {
                            acc[v] = reaction[v] || 0;
                            acc[`your${v}`] = reaction[`your${v}`] || 0;
                            return acc;
                        }, {} as { [key in yourEmoji]: number } & { [key in ValueOf<typeof ReactionEmojis>]: number })
                    };
                    this.lineReactions.set(reaction.original_sha_line, lineReaction);
                    projectIdFiles.push(`${reaction.project_id}-${reaction.file_name}`);
                });
                projectIdFiles.forEach(projectIdFile => {
                    this.reactions.set(projectIdFile, this.lineReactions);
                });
                this.WS_INIT = true;

                if (newIds.length) {
                    const reactionContentRequest: ReactionDetailsRequest = {
                        action: "reaction-details",
                        reactions: newIds.map(id => ({id}))
                    };
                    await this.enqueueWithWs(ws, reactionContentRequest);
                }
                this.feedViewProvider.setReactions(folder, reactions);
            } else if (parsedData.type === 'reactions') {
                const reactions = (parsedData as ProjectReactionsResponse).reactions;
                this.USE_TEMP = false;
                this.addReactions(reactions);
                this.onNewReactionCallback(reactions);
                this.updateAppViewCallback();
                const newIds: string[] = [];
                reactions.forEach(reaction => {
                    if (!this.detailsMap.has(reaction.id)) {
                        newIds.push(reaction.id);
                    }
                });
                await this.requestDetails(ws, newIds);
                this.feedViewProvider.addReactions(folder, reactions);
            } else if (parsedData.type === 'details') {
                const reactions = (parsedData as DetailsResponse).reactions;
                reactions.forEach(reaction => {
                    this.detailsMap.set(reaction.id, reaction);
                });
                this.updateAppViewCallback();
                this.feedViewProvider.addDetails(folder, this.detailsMap);
            }
        });
    }

    public onNewReactions(callback: NewReactionEventCallbackFunction) {
        this.onNewReactionCallback = (params) => callback(params);
    }

    public onReconnect(callback: () => void) {
        this.onReconnectCallback = () => {
            callback();
        };
    }

    // TODO change this to be per project
    waitForDataInit(workspace: WorkspaceFolder) {
        const emailHash = this.activeWorkspaceEmailMapping.get(workspace.uri.fsPath);
        this.activeSockets.get(emailHash as string) as WebSocket;
        return new Promise((res, rej) => {
            if (this.WS_INIT) {
                return res('success');
            }
            let counter = 0;
            const interval = setInterval((() => {
                if (this.WS_INIT) {
                    clearInterval(interval);
                    return res('success');
                } else if (counter > 600) {
                    clearInterval(interval);
                    return rej(new Error('cant connect'));
                }
                counter += 1;
            }).bind(this), 100);
        });
    }

    waitForWSConnection(ws: WebSocket) {
        return new Promise((res, rej) => {
            if (ws && ws.readyState === ws.OPEN) {
                return res('success');
            }
            let counter = 0;
            const interval = setInterval((() => {
                if (ws && ws.readyState === ws.OPEN) {
                    clearInterval(interval);
                    return res('success');
                } else if (counter > 600) {
                    clearInterval(interval);
                    return rej(new Error('cant connect'));
                }
                counter += 1;
            }).bind(this), 100);
        });
    }

    waitForConnection(workspace: WorkspaceFolder) {
        const emailHash = this.activeWorkspaceEmailMapping.get(workspace.uri.fsPath);
        const ws = this.activeSockets.get(emailHash as string) as WebSocket;
        return this.waitForWSConnection(ws);
    }

    addReactions(reactions: (ProjectReactionsResponse['reactions'] | NewReactionAddEvent['reactions'])) {
        reactions.forEach(reaction => {
            const shaLine = `${reaction.original_sha}_${reaction.original_line}`;
            const lineReactions = this.USE_TEMP ? this.lineReactionsTemp : this.lineReactions;
            const reactions = this.USE_TEMP ? this.reactionsTemp : this.reactions;
            let lineReaction = lineReactions.get(shaLine);
            lineReaction = lineReaction || {...EMPTY_LINE_REACTION};

            if ('id' in reaction) {
                lineReaction.ids.add(reaction.id);
            }

            const yourEmoji = `your${reaction.type}` as yourEmoji;
            if (lineReaction[yourEmoji] > 0) {
                return;
            }
            lineReaction[reaction.type] = (lineReaction[reaction.type] || 0) + 1;

            lineReaction[yourEmoji] = (lineReaction[yourEmoji] || 0) + 1;

            if (!lineReactions.has(shaLine)) {
                lineReactions.set(shaLine, lineReaction);
            }
            const projectIdFile = `${reaction.project_id}-${reaction.file_name}`;
            if (!reactions.get(projectIdFile) || this.USE_TEMP) {
                reactions.set(projectIdFile, lineReactions);
            }
        });
    }


    async enqueue(workspace: WorkspaceFolder, message: ProjectOpenEvent | NewReactionAddEvent | ReactionStatusEvent | ReactionDetailsRequest, attempts: number = 0): Promise<void> {
        const emailHash = this.activeWorkspaceEmailMapping.get(workspace.uri.fsPath);
        if (emailHash) {
            await this.waitForConnection(workspace);
            const ws = this.activeSockets.get(emailHash);
            (ws as WebSocket).send(JSON.stringify(message));
            if ('action' in message && message.action === 'reaction') {
                this.lineReactionsTemp = new Map(this.lineReactions);
                this.reactionsTemp = new Map(this.reactions);
                this.USE_TEMP = true;
                this.addReactions(message.reactions as NewReactionAddEvent['reactions']);
                this.updateAppViewCallback();
            }
        }
    }

    async enqueueWithWs(ws: WebSocket, message: ProjectOpenEvent | NewReactionAddEvent | ReactionStatusEvent | ReactionDetailsRequest, attempts: number = 0): Promise<void> {
        await this.waitForWSConnection(ws);
        (ws as WebSocket).send(JSON.stringify(message));
        if ('action' in message && message.action === 'reaction') {
            this.lineReactionsTemp = new Map(this.lineReactions);
            this.reactionsTemp = new Map(this.reactions);
            this.USE_TEMP = true;
            this.addReactions(message.reactions as NewReactionAddEvent['reactions']);
            this.updateAppViewCallback();
        }
    }

    async init() {
        await Promise.all((workspace.workspaceFolders || []).map(async folder => {
            const folderPath = folder.uri.fsPath;
            const userInfo = await getUserInfo(folderPath);
            if (userInfo.email) {
                const emailHash = hash.getEmailHash(userInfo.email);
                this.open(folder, emailHash);
                this.activeWorkspaceEmailMapping.set(folderPath, emailHash);
                const remoteUrl = await getRemoteUrl();
                const branchName = await getCurrentBranch(folderPath);
                const locationHash = hash.getWorkspaceLocationHash(folderPath);
                const currentCommitInfo = await getCurrentCommit(folderPath);
                let remoteAccessValidated = false;
                if (remoteUrl) {
                    remoteAccessValidated = await validateReadAccess(remoteUrl);
                }
                const projectOpenEvent: ProjectOpenEvent = {
                    "branch_name": branchName,
                    // TODO see if we can merge default branch methods
                    default_branch_name: await getDefaultBranchName(folderPath),
                    "current_sha": currentCommitInfo.sha,
                    "current_sha_ts": currentCommitInfo.datetime,
                    "location_hash": locationHash,
                    "name": basename(folder.uri.fsPath),
                    remote_url: remoteUrl,
                    remote_access_validated: remoteAccessValidated,
                };
                await this.enqueue(folder, projectOpenEvent);
            }
        }));
    }
}