import {ProjectInfo, ReactionEmojis, ValueOf} from "../types/app";
import hash from "../util/hash";
import {resolve} from "path";
import {Position, Range, Selection, window, workspace} from "vscode";
import {NewReactionEvent} from "../connection/ws";
import blame from "../blame";
import store from "../util/store";
import {getProperty} from "../util/configuration";

export class NotificationView {

    static async onNewReactions(reactions: NewReactionEvent) {
        if (!getProperty("newReactionNotificationsEnabled")) {
            return;
        }

        const reactionsPerFile: {
            [file_name: string]: {
                [line: number]: { [emoji in ValueOf<typeof ReactionEmojis>]?: number }
            }
        } = {};
        const projectIdToWorkspace: { [project_id: string]: ProjectInfo } = {};
        await Promise.all(reactions.map(async reaction => {
            if (reaction.your_reaction) {
                return;
            }
            if (getProperty("newReactionNotificationsOnlyOnMyLines")) {
                if (!reaction.your_line) {
                    return;
                }
            }

            let workspace = projectIdToWorkspace[reaction.project_id];
            if (!workspace) {
                const found = Array.from(store.workspaceInfo.values()).find(value => value.id === reaction.project_id);
                if (found) {
                    workspace = found;
                }
            }
            if (!workspace) {
                return;
            }

            projectIdToWorkspace[reaction.project_id] = workspace;


            const workspaceLocation = hash.getWorkspaceLocation(workspace.location_hash);

            if (!workspaceLocation) {
                return;
            }

            const filePath = resolve(workspaceLocation, reaction.file_name);

            const blameInfo = await blame.getBlameInfo(filePath);
            const stillThere = (Array.from(blameInfo?.values() || [])).find(lineBlame =>
                lineBlame?.line.source === reaction.original_line &&
                lineBlame?.commit.hash === reaction.original_sha
            );

            if (!stillThere) {
                return;
            }

            if (!reactionsPerFile[filePath]) {
                reactionsPerFile[filePath] = {};
            }
            if (!reactionsPerFile[filePath][stillThere.line.result]) {
                reactionsPerFile[filePath][stillThere.line.result] = {};
            }
            reactionsPerFile[filePath][stillThere.line.result][reaction.type] =
                (reactionsPerFile[filePath][stillThere.line.result][reaction.type] || 0) + 1;
        }));

        await Promise.all(Object.keys(reactionsPerFile).map(async (filePath) => {
            let minLine = Number.MAX_SAFE_INTEGER;
            let maxLine = 0;
            const reactionsGot = Object.entries(reactionsPerFile[filePath]).reduce((acc, [line, curr]) => {
                minLine = Math.min(minLine, parseInt(line, 10) - 1);
                maxLine = Math.max(minLine, parseInt(line, 10) - 1);
                Object.keys(curr).forEach((key) => {
                    const k = key as ValueOf<typeof ReactionEmojis>;
                    if (!acc[k]) {
                        acc[k] = 0;
                    }
                    // @ts-ignore
                    acc[k] += curr[k];
                });
                return acc;
            }, {} as { [emoji in ValueOf<typeof ReactionEmojis>]?: number });
            const selection = await window.showInformationMessage(`
				You got ${Object.keys(reactionsGot).map((key) => {
                const k = key as ValueOf<typeof ReactionEmojis>;
                return `${reactionsGot[k]} ${k}`;
            }).join(', ')}
				at ${filePath}
				`, 'Go to Location', 'Cancel');
            if (selection === 'Go to Location') {
                const document = await workspace.openTextDocument(filePath);
                const editor = await window.showTextDocument(document, 1, false);
                editor.selections = [new Selection(new Position(minLine, 0), new Position(maxLine, 0))];
                const range = new Range(new Position(minLine, 0), new Position(maxLine, 0));
                editor.revealRange(range);
            }
        }));
    }
}