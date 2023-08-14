import {
    CancellationToken,
    TextDocument,
    Uri,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    workspace,
    WorkspaceFolder,
	env
} from "vscode";
import {
    Details,
    ProjectReactionsInitialResponse,
    ProjectReactionsResponse,
    ReactionEmojis,
    ValueOf
} from "../types/app";
import {resolve} from "path";
import {Blame} from "../git/file";
import {evaluateMapEquality} from "../util/map-equality";

import {APP_HANDLE} from "../util/constants";

interface Reaction {
    file_name: string;
    ids: string[];
    original_sha: string;
    original_line: number;
}

export class FeedViewProvider implements WebviewViewProvider {

    public static readonly viewType = `${APP_HANDLE}.feed`;
    private reactions: Map<WorkspaceFolder, Reaction[]> = new Map();
    private detailsMap: Map<WorkspaceFolder, Map<string, Details>> = new Map();
    private reactionsTransformed: Map<WorkspaceFolder, {
        [reaction_group_id: string]: {
            name?: string;
            file: string;
            branch?: string;
            content?: string;
            count: number;
            type?: ValueOf<ReactionEmojis>;
            ts?: string;
            seen?: boolean;
            fsPath?: string;
            line?: number
            lineEmptyText?: string
        }
    }> = new Map();
    private blameCache: Map<string, Blame> = new Map();

    private _view?: WebviewView;

    constructor(
        private readonly _extensionUri: Uri,
    ) {
    }

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        const folders = workspace.workspaceFolders;

        if (!folders || folders.length === 0) {
            webviewView.webview.html = '';
            return;
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, folders[0]);
    }

    private async setReactionsTransformed(folder: WorkspaceFolder) {
        const docMap = new Map<string, TextDocument>();
        const reactionsTransformed: {
            [reaction_group_id: string]: {
                name?: string;
                file: string;
                branch?: string;
                content?: string;
                count: number;
                type?: ValueOf<ReactionEmojis>;
                ts?: string;
                seen?: boolean;
                fsPath?: string;
                line?: number
                lineEmptyText?: string
            }
        } = {};

        await Promise.all((this.reactions.get(folder) || []).map(async reaction => {
            const fullPath = resolve(folder.uri.fsPath, reaction.file_name);
            if (!docMap.has(reaction.file_name)) {
                const document = await workspace.openTextDocument(fullPath);
                docMap.set(reaction.file_name, document);
            }

            const fileBlame = this.blameCache.get(fullPath);
            const stillThere = (Array.from(fileBlame?.values() || [])).find(lineBlame =>
                lineBlame?.line.source === reaction.original_line &&
                lineBlame?.commit.hash === reaction.original_sha
            );

            let lineEmptyText = '';
            if (!fileBlame) {
                lineEmptyText = 'Click to Open File to Detect Exact Line';
            } else {
                if (!stillThere) {
                    lineEmptyText = 'Not existing in your current git tree';
                }
            }

            reaction.ids.forEach(id => {
                const detail = this.detailsMap.get(folder)?.get(id);
                if (detail) {
                    if (!reactionsTransformed[detail.reaction_group_id]) {
                        reactionsTransformed[detail.reaction_group_id] = {
                            name: detail.name,
                            file: reaction.file_name,
                            branch: detail.branch,
                            content: detail.content,
                            type: detail.type,
                            count: 0,
                            ts: detail.ts,
                            seen: detail.seen,
                            fsPath: docMap.get(reaction.file_name)?.uri.fsPath,
                            line: stillThere?.line.source,
                            lineEmptyText,
                        };
                    }
                    reactionsTransformed[detail.reaction_group_id].count += 1;
                } else {
                    if (!reactionsTransformed[reaction.ids.join(",")]) {
                        reactionsTransformed[reaction.ids.join(",")] = {
                            // name: detail.name,
                            file: reaction.file_name,
                            // branch: detail.branch,
                            // content: detail.content,
                            // type: detail.type,
                            count: 0,
                            // ts: detail.ts,
                            // seen: detail.seen,
                            fsPath: docMap.get(reaction.file_name)?.uri.fsPath,
                            line: stillThere?.line.source,
                            lineEmptyText,
                        };
                    }
                    reactionsTransformed[reaction.ids.join(",")].count += 1;
                }

            });
        }));
        this.reactionsTransformed.set(folder, reactionsTransformed);
    }

    public async setBlame(folder: WorkspaceFolder, fileName: string, blame: Blame | undefined) {

        if (!blame || evaluateMapEquality(this.blameCache.get(fileName), blame)) {
            return;
        }

        this.blameCache.set(fileName, blame);

        await this.setReactionsTransformed(folder);

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, folder);
        }
    }

    public async setReactions(folder: WorkspaceFolder, projectReactions: ProjectReactionsInitialResponse['reactions']) {

        this.reactions.set(folder, projectReactions.map(({ids, file_name, original_sha_line}) => ({
            ids,
            file_name,
            original_sha: original_sha_line.split('_')[0],
            original_line: parseInt(original_sha_line.split('_')[1], 10)
        })));
        await this.setReactionsTransformed(folder);

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, folder);
        }
    }

    public async addReactions(folder: WorkspaceFolder, projectReactions: ProjectReactionsResponse['reactions']) {
        if (this.reactions.has(folder)) {
            const reactions = this.reactions.get(folder);
            reactions?.push(...projectReactions.map(({id, file_name, original_sha, original_line}) => ({
                ids: [id],
                file_name,
                original_sha,
                original_line
            })));
        } else {
            this.reactions.set(folder, projectReactions.map(({
                                                                 id,
                                                                 file_name,
                                                                 original_sha,
                                                                 original_line
                                                             }) => ({
                ids: [id],
                file_name,
                original_sha,
                original_line
            })));
        }
        await this.setReactionsTransformed(folder);

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, folder);
        }
    }

    public async addDetails(folder: WorkspaceFolder, detailsMap: Map<string, Details>) {
        if (this.detailsMap.has(folder)) {
            for (const [key, value] of detailsMap.entries()) {
                const existingMap = this.detailsMap.get(folder);
                existingMap?.set(key, value);
            }
        } else {
            this.detailsMap.set(folder, detailsMap);
        }

        await this.setReactionsTransformed(folder);

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, folder);
        }
    }

    private getHtmlContent(folder: WorkspaceFolder): string {
        const reactionsTransformed = this.reactionsTransformed.get(folder);
        if (!reactionsTransformed) {
            return '<div class="load-container"><div class="lds-dual-ring"/></div>';
        }
        if (Object.values(reactionsTransformed).length === 0) {
            return 'No reactions for this project yet';
        }

        const title = `
		  <div class="table-container" role="table" aria-label="Destinations">
			<div class="flex-table header" role="rowgroup">
			<div class="flex-row first" role="columnheader">Name</div>
			<div class="flex-row" role="columnheader">When</div>
			<div class="flex-row" role="columnheader">File</div>
			<div class="flex-row" role="columnheader">Branch</div>
			<div class="flex-row" role="columnheader">Content</div>
			<div class="flex-row" role="columnheader">Count</div>
		  </div>`;

		const reactionsSorted = Object.values(reactionsTransformed).sort((a,b)=> {
			if(a.ts && b.ts){
				return new Date(b.ts).valueOf() - new Date(a.ts).valueOf();
			}
			return 0;
		});

        return (
            `
			<div class="table-container" role="table" aria-label="Destinations">
			${title}
			  ${reactionsSorted.map(reaction => {
                    return (
                        `
					  <div class="flex-table row" role="rowgroup">
						  <div class="flex-row first" role="cell">
							  ${reaction.seen === false ? `
								  <div class="tooltip-container">
										  <p class="tooltip-text dot-tooltip">New!</p>
										  <div class="dot tooltip-button">&#183;</div>
								  </div>
							  ` : '<span class="dot"></span>'}
							  <span>${reaction.name || '...'}</span>
						  </div>
						  <div class="flex-row" role="cell">
						  ${reaction.ts ?`
							  <div class="time-container">
								<input type="hidden" name="time" value="${reaction.ts}"/>
								<input type="hidden" name="locale" value="${env.language}"/>
								<div class="time"></div>
							  </div>
							  `:'...'}
						  </div>
						  <div class="flex-row" role="cell">
							  ${reaction.line ? `
							  <a class="tooltip-button" href="vscode://file/${resolve(folder.uri.fsPath, reaction.file)}${reaction.line ? `:${reaction.line}` : ':1:1'}">
								  ${reaction.file}@${reaction.line ? `${reaction.line}` : 'unknown'}
								  </a>
							  ` : `
							  <div class="tooltip-container">
									  <p class="tooltip-text comment-tooltip">${reaction.lineEmptyText || ''}</p>
									  <a class="tooltip-button" href="vscode://file/${resolve(folder.uri.fsPath, reaction.file)}${reaction.line ? `:${reaction.line}` : ':1:1'}">
								  ${reaction.file}@${reaction.line ? `${reaction.line}` : 'unknown'}
								  </a>
							  </div>
							  `}
						  </div>
						  <div class="flex-row" role="cell">${reaction.branch || '...'}</div>
						  <div class="flex-row" role="cell">
						   ${
                            reaction.content ? `
							  <div class="tooltip-container">
								  <p class="tooltip-text comment-tooltip">${reaction.content || ''}</p>
								  <svg class="tooltip-button" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
									  <path opacity="1" d="M14.4 0H1.6C0.72 0 0 0.72 0 1.6V16L3.2 12.8H14.4C15.28 12.8 16 12.08 16 11.2V1.6C16 0.72 15.28 0 14.4 0Z" fill="rgb(137,137,137)"/>
								  </svg>
							  </div>
							  ` : `<svg class="tooltip-button" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							  <path opacity="0.7" d="M14.4 0H1.6C0.72 0 0 0.72 0 1.6V16L3.2 12.8H14.4C15.28 12.8 16 12.08 16 11.2V1.6C16 0.72 15.28 0 14.4 0Z" fill="rgb(108,108,108)"/>
						  </svg>`
                        }
						  </div>
						  <div class="flex-row" role="cell">
								  <div class="md-chips">
									  <div class="md-chip md-chip-hover">
									  <div class="md-chip-icon">${reaction.type || ''}</div>
									  ${reaction.count}
									  </div>
								  </div>
						  </div>
					  </div>
					  `
                    );
                }
            ).join("\n")}
		  </div>
			`
        );
    }

    private _getHtmlForWebview(webview: Webview, folder: WorkspaceFolder) {

        const reactionsTransformed = this.reactionsTransformed.get(folder);
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(Uri.joinPath(this._extensionUri, 'assets', 'js', 'main.js'));

        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(Uri.joinPath(this._extensionUri, 'assets', 'css', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(Uri.joinPath(this._extensionUri, 'assets', 'css', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(Uri.joinPath(this._extensionUri, 'assets', 'css', 'main.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>Reactions Feed</title>
			</head>
			<body>
			<div class="adadot">
				for more details go to <a href="https://code-reactions.adadot.com">code-reactions.adadot.com</a></div>

			${this.getHtmlContent(folder)}

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}