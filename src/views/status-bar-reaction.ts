import {Command, MarkdownString, StatusBarAlignment, StatusBarItem, ThemeColor, window} from "vscode";
import {Details, ReactionEmojis, ReactionEmojisInverse, StoreLineReaction, yourEmoji} from "../types/app";
import {getActiveTextEditor} from "../util/vs-code";

import {APP_HANDLE} from "../util/constants";
import fileInfo from "../util/file-info";
import {toTooltipMarkdown} from "../util/textdecorator";

export class StatusBarReaction {
    
    private statusBarItem: StatusBarItem;
    public emoji:ReactionEmojis;
    private yourEmoji: yourEmoji;
	public priority:number;

    constructor(emoji: ReactionEmojis, priority: number){
        this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, priority);
        this.emoji = emoji;
        this.yourEmoji = `your${emoji}` as yourEmoji;
		this.priority = priority;
    }

	private changePriority(priority: number) {
		if(this.priority !== priority){
			this.priority = priority;
			this.dispose();
			this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, priority);
		}
	}

	private text(lineReactions: StoreLineReaction | undefined):string {
		if(!lineReactions) {
			return '';
		}
		return `${this.emoji} ${lineReactions[this.emoji] || 0}`;
	}

	private color(lineReactions: StoreLineReaction | undefined):string | ThemeColor {
		if(lineReactions && lineReactions[this.yourEmoji] > 0) {
			return '#59C36A';
		}
		return new ThemeColor(`statusBarItem.prominentForeground`);
	}

	private async command(lineReactions: StoreLineReaction|undefined, linesSelected: number): Promise<Command | undefined>{
		if(lineReactions && lineReactions[this.yourEmoji] && lineReactions[this.yourEmoji] >= linesSelected){
			return undefined;
		}
		const textEditor = getActiveTextEditor();
		if(textEditor) {
			const repo = await fileInfo.getRepoFromFileUri(textEditor?.document.uri);
			if(repo){
				return {
                    // @ts-ignore
                    command: `${APP_HANDLE}.${ReactionEmojisInverse[this.emoji]}`,
                    title: `Code Reactions: ${this.emoji}`,
                    // @ts-ignore
					arguments: [textEditor.document, repo, textEditor.selections, this.emoji]
				};
			}
		}
		return undefined;
	}

    private async tooltip(lineReactions: StoreLineReaction|undefined, details?: Details[]):Promise<MarkdownString | string> {
		if(!lineReactions){
			return '';
		}
		if(!lineReactions[this.emoji]){
			return `No ${this.emoji} yet`;
		}
		if(!details || details.length===0){
			return `${lineReactions[this.emoji]} ${this.emoji} by ${lineReactions[this.yourEmoji] > 0 ? 'you ' : ''}${lineReactions[this.yourEmoji] > 0 && lineReactions[this.emoji]-lineReactions[this.yourEmoji] > 0 ? 'and ':''}${lineReactions[this.emoji]-lineReactions[this.yourEmoji] > 0 ? `${lineReactions[this.emoji]-lineReactions[this.yourEmoji]} others` : ''}`;
		}
		return await toTooltipMarkdown(this.emoji, details);
	}

    public async render(lineReactions: StoreLineReaction | undefined, show: boolean, linesSelected: number, details?: Details[], priority?: number): Promise<void> {
		if(typeof priority === 'number'){
			this.changePriority(priority);
		}
		this.statusBarItem.text = this.text(lineReactions);
		this.statusBarItem.color = this.color(lineReactions);
		this.statusBarItem.tooltip = await this.tooltip(lineReactions, details);
		this.statusBarItem.command = await this.command(lineReactions, linesSelected);
		this.statusBarItem.backgroundColor = new ThemeColor(`statusBarItem.remoteBackground`);
        if(show){
            this.show();
        }else{
            this.hide();
        }
	}

    public renderStatic(text: string, tooltip: string, state?: 'warning' | 'error'): void {
		this.statusBarItem.text = text;
		this.statusBarItem.color = new ThemeColor(`statusBarItem.prominentForeground`);
		this.statusBarItem.tooltip = tooltip;
		this.statusBarItem.command = undefined;
		if(state) {
			this.statusBarItem.backgroundColor = new ThemeColor(`statusBarItem.${state}Background`);
		}else{
			this.statusBarItem.backgroundColor = new ThemeColor(`statusBarItem.remoteBackground`);
		}
		this.show();
	}

    public dispose(){
        this.statusBarItem.dispose();
    }

    public hide(){
        this.statusBarItem.hide();
    }

    public show(){
        this.statusBarItem.show();
    }
}