import {TextDocument, workspace, commands, window} from "vscode";
import {WebSocket} from "ws";
import {
    getCurrentBranch,
    getCurrentCommit,
    getDefaultBranchName,
    getRemoteUrl,
    validateReadAccess
} from "../git/gitcommand";
import {basename} from "path";
import {
    ProjectInfoResponse,
    ProjectOpenEvent,
    ProjectReactionsInitialResponse,
    ProjectReactionsResponse,
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
import {UserInfo} from "../types/git";
import { Repo } from "../util/repo";
import fileInfo from "../util/file-info";
import { ReactionEmojis } from "../types/reactions";

export type NewReactionEvent = ProjectReactionsResponse['reactions'];

type NewReactionEventCallbackFunction = (event: NewReactionEvent) => void;

export class WS {
    private activeRepoEmailMapping = new Map<string, string>();
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

    async getLineReactions(repo?: Repo, fileName?: string, originalSha?: string, originalLine?: number): Promise<StoreLineReaction> {
        if (!repo || !fileName || !originalSha || !originalLine) {
            return EMPTY_LINE_REACTION();
        }

        await this.waitForDataInit(repo);

        const projectId = store.workspaceInfo.get(hash.getWorkspaceLocationHash(repo.root.fsPath))?.id;
        const lineReactions = this.USE_TEMP ? this.reactionsTemp.get(`${projectId}-${fileName}`) : this.reactions.get(`${projectId}-${fileName}`);
        if (!lineReactions) {
            return EMPTY_LINE_REACTION();
        }

        return lineReactions.get(`${originalSha}_${originalLine}`) || EMPTY_LINE_REACTION()
    }

    async getFileReactions(repo: Repo | undefined, fileName: string): Promise<Map<string, StoreLineReaction> | undefined> {
        if (!repo) {
            return undefined;
        }
        await this.waitForDataInit(repo);
        const projectId = store.workspaceInfo.get(hash.getWorkspaceLocationHash(repo.root.fsPath))?.id;
        return this.reactions.get(`${projectId}-${getFileName(repo, fileName)}`);
    }

    private async requestDetails(ws: WebSocket, newIds: string[]) {
        if (newIds.length) {
            const reactionContentRequest: ReactionDetailsRequest = {
                action: "reaction-details",
                reactions: newIds.map(id => ({id})),
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
            await this.enqueueWithWs(ws, reactionContentRequest);
        }
    }

    public async requestDocumentReactionDetails(repo: Repo | undefined, textDocument: TextDocument) {
        if (!repo) {
            return;
        }
        const fileReactions = await this.getFileReactions(repo, textDocument.fileName);
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
                reactions: newIds.map(id => ({id})),
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
            await this.enqueue(repo, reactionContentRequest);
        }
    }

    open(repo: Repo, userInfo: UserInfo, retries: number = 0) {
        const emailHash = hash.getEmailHash(userInfo.email as string);
        const url = new URL('ws://localhost:3003?email_hash=${emailHash}');
        // const url = new URL('wss://t65omwlbx9.execute-api.eu-west-1.amazonaws.com/sit');
        url.searchParams.append('email_hash', emailHash);
        if(userInfo.name){
            url.searchParams.append('name', userInfo.name);
        }else{
            console.log("NO NAME");
        }

        const ws = new WebSocket(url.toString());
        this.activeSockets.set(emailHash, ws);

        const reconnect = () => {
            setTimeout(() => {
                if (!this.ERROR) {
                    this.open.bind(this)(repo, userInfo);
                }
            }, 50);
        };

        ws.on('error', (e) => {
            this.ERROR = true;
            commands.executeCommand('setContext', `${APP_HANDLE}.initialized`, false);
            setTimeout(() => {
                this.open(repo, userInfo, retries + 1);
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
                        ...store.reactionValues().reduce((acc, v) => {
                            acc[v] = reaction[v] || 0;
                            acc[`your${v}`] = reaction[`your${v}`] || 0;
                            return acc;
                        }, {} as { [key in yourEmoji]: number } & { [key in ValueOf<typeof ReactionEmojis>]: number }),
                        ids: new Set(reaction.ids),
                    } as StoreLineReaction;
                    this.lineReactions.set(reaction.original_sha_line.toString(), lineReaction);
                    projectIdFiles.push(`${reaction.project_id}-${reaction.file_name}`);
                });
                projectIdFiles.forEach(projectIdFile => {
                    this.reactions.set(projectIdFile, this.lineReactions);
                });
                this.WS_INIT = true;

                if (newIds.length) {
                    const reactionContentRequest: ReactionDetailsRequest = {
                        action: "reaction-details",
                        reactions: newIds.map(id => ({id})),
                        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
                    };
                    await this.enqueueWithWs(ws, reactionContentRequest);
                }
                this.feedViewProvider.setReactions(repo, reactions);
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
                this.feedViewProvider.addReactions(repo, reactions);
            } else if (parsedData.type === 'details') {
                const reactions = (parsedData as DetailsResponse).reactions;
                reactions.forEach(reaction => {
                    this.detailsMap.set(reaction.id, reaction);
                });
                this.feedViewProvider.addDetails(repo, this.detailsMap);
                this.updateAppViewCallback();
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
    waitForDataInit(repo: Repo) {
        const emailHash = this.activeRepoEmailMapping.get(repo.root.fsPath);
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

    waitForConnection(repo: Repo) {
        const emailHash = this.activeRepoEmailMapping.get(repo.root.fsPath);
        const ws = this.activeSockets.get(emailHash as string) as WebSocket;
        return this.waitForWSConnection(ws);
    }

    addReactions(reactions: (ProjectReactionsResponse['reactions'] | NewReactionAddEvent['reactions'])) {
        reactions.forEach(reaction => {
            const shaLine = `${reaction.original_sha}_${reaction.original_line}`;
            const lineReactions = this.USE_TEMP ? this.lineReactionsTemp : this.lineReactions;
            const reactions = this.USE_TEMP ? this.reactionsTemp : this.reactions;
            let lineReaction = lineReactions.get(shaLine);
            lineReaction = lineReaction || EMPTY_LINE_REACTION();

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


    async enqueue(repo: Repo, message: ProjectOpenEvent | NewReactionAddEvent | ReactionStatusEvent | ReactionDetailsRequest, attempts: number = 0): Promise<void> {
        const emailHash = this.activeRepoEmailMapping.get(repo.root.fsPath);
        if (emailHash) {
            await this.waitForConnection(repo);
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

    private async initRepo(userInfo: UserInfo, repo: Repo){
        const folderPath = repo.root.fsPath;
                const emailHash = hash.getEmailHash(userInfo.email as string);
                if(this.activeSockets.has(emailHash) && this.activeRepoEmailMapping.has(folderPath)){
                    console.log('already connected');
                    return;
                }
                console.log('call open');
                this.open(repo, userInfo);
                this.activeRepoEmailMapping.set(folderPath, emailHash);
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
                    default_branch_name: await getDefaultBranchName(folderPath),
                    "current_sha": currentCommitInfo.sha,
                    "current_sha_ts": currentCommitInfo.datetime,
                    "location_hash": locationHash,
                    "name": basename(folderPath),
                    remote_url: remoteUrl,
                    remote_access_validated: remoteAccessValidated,
                };
                await this.enqueue(repo, projectOpenEvent);
    }

    async initVisibleEditors() {
        await Promise.all((window.visibleTextEditors || []).map(async editor => {
            const userInfo = await fileInfo.getUserInfo(editor.document.fileName);
            const repo = await fileInfo.getRepoFromFileUri(editor.document.uri);
            if (repo && userInfo?.email) {
                await this.initRepo(userInfo, repo);
            }
        }));
    }

    async initWorkspaceFolders(){
        await Promise.all((workspace.workspaceFolders || []).map(async folder => {
            const userInfo = await fileInfo.getUserInfo(folder.uri.fsPath);
            const repo = await fileInfo.getRepoFromFileUri(folder.uri);
            if (repo && userInfo?.email) {
                await this.initRepo(userInfo, repo);
            }
        }));
    }

    async init() {
        await this.initWorkspaceFolders();
        await this.initVisibleEditors();
    }
}