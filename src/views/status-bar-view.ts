import {Command, Disposable, StatusBarAlignment, StatusBarItem, window, workspace,} from "vscode";
import {Details, getProperty, ReactionEmojis, StoreLineReaction, ValueOf} from "../types/app";
import {PartialTextEditor} from "../util/vs-code";
import {StatusBarReaction} from "./status-bar-reaction";

import {APP_HANDLE} from "../util/constants";

const defaultReactions: (ValueOf<typeof ReactionEmojis>)[] = Object.values(ReactionEmojis);

export class StatusBarView {
	private statusBars: StatusBarReaction[] = [];
	private readonly statusBarMore: StatusBarItem;
	private readonly configChange: Disposable;
	public showingMore: boolean = false;
	private currentProminentReactions: (keyof StoreLineReaction)[] = defaultReactions.slice(0, getProperty("statusBarProminentReactions"));
	private timeout?: NodeJS.Timeout;

	constructor() {
		this.statusBars = this.createStatusBarItem();
		this.statusBarMore = window.createStatusBarItem(
			StatusBarAlignment.Right,
			this.statusBars.length - getProperty("statusBarProminentReactions"),
		);
		this.configChange = workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(APP_HANDLE)) {
				this.createStatusBarItem();
			}
		});
	}

	private createStatusBarItem(): StatusBarReaction[] {
		if(this.statusBars.length > 0) {
			this.statusBars.forEach(statusBar =>{
				statusBar.dispose();
			});
			this.statusBars = [];
		}

		if (this.statusBarMore) {
			this.statusBarMore.dispose();
		}

		const bars: StatusBarReaction[] = [];

		defaultReactions.forEach((emoji, i)=>{
			bars.push(
				new StatusBarReaction(emoji, defaultReactions.length - i)
			);
		});

		return bars;
	}

	private prominentReactions(lineReactions: StoreLineReaction | undefined):(keyof StoreLineReaction)[] {
		const prominentReactionsLimit = getProperty("statusBarProminentReactions");
		if(!lineReactions) {
			this.currentProminentReactions = defaultReactions.slice(0, prominentReactionsLimit);
			return this.currentProminentReactions;
		}
		const keysSorted = Object.values(ReactionEmojis)
			.filter(key => lineReactions[key]>0)
			.sort((a,b)=>lineReactions[a]-lineReactions[b]);

		if(keysSorted.length < prominentReactionsLimit) {
			const allReactions = [
				...keysSorted,
				...defaultReactions.filter(r=> !keysSorted.includes(r))
			];
			this.currentProminentReactions = allReactions.slice(0, prominentReactionsLimit) as (keyof StoreLineReaction)[];
			return this.currentProminentReactions;
		}
		this.currentProminentReactions = keysSorted.slice(0, prominentReactionsLimit) as (keyof StoreLineReaction)[];
		return this.currentProminentReactions;
	}

	private showOnlyOne(text: string, tooltip: string, state?: 'warning' | 'error') {
		this.statusBars.forEach((bar, i)=>{
			if(i === 0){
				bar.renderStatic(text, tooltip, state);
			}else{
				bar.hide();
			}
		});
	}

	public set(
		uncommitted: boolean,
		lineReactions: StoreLineReaction | undefined,
		editor: PartialTextEditor | undefined,
		linesSelected: number,
		details?: Details[]
	): void {
		if(this.timeout){
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		const prominentReactions = this.prominentReactions(lineReactions);
		if (uncommitted) {
			this.showOnlyOne(getProperty("statusBarMessageNoCommit"), 'Can not react on an uncommitted line!');
		} else if (!lineReactions) {
			this.clear();
		} else {
			let prominentCounter = (this.statusBarMore.priority || 0)+prominentReactions.length;
			let nonProminentCounter = defaultReactions.length - prominentReactions.length;

			this.statusBars.forEach((bar)=>{
				const prominentIndex = prominentReactions.findIndex(reaction=> reaction === bar.emoji);
				if(prominentIndex>-1){
					bar.render(lineReactions, true, linesSelected, prominentCounter);
					prominentCounter -=1;
				}else {
					bar.render(lineReactions, this.showingMore, linesSelected, nonProminentCounter);
					nonProminentCounter -=1;
				}
			});
			this.renderMore(this.showingMore ? '➖' : '➕');
		}
	}

	private permanentError(): void {
		this.showOnlyOne(`😞`, 'Could not connect to get reactions. Will retry at some point again', 'error');
	}

	public setError(): void {
		if(!this.timeout) {
			this.showOnlyOne(`🤔`, 'Struggling to get reactions. Will keep retrying silently', 'warning');
			this.timeout = setTimeout(() => {
				this.permanentError();
			}, 30000);
		}
	}

	public clear(): void {
		this.statusBars.forEach(bar=> {
			bar.hide();
		});
		this.renderMore('');
	}

	public activity(): void {
		this.showOnlyOne("$(sync~spin) Calculating Reactions", '');
	}

	public dispose(): void {
		this.configChange.dispose();
	}

	private more(): Command {

		return {
			title: `${APP_HANDLE}.more`,
			command: `${APP_HANDLE}.more`,
			arguments:[()=>this.toggleShowMore.bind(this)()]
		};
	}

	public toggleShowMore() {
		this.showingMore = !this.showingMore;
		this.statusBars.forEach(bar => {
			if(this.showingMore) {
				bar.show();
			}else {
				if(!this.currentProminentReactions.find(reaction=>reaction === bar.emoji)){
					bar.hide();
				}
			}
		});
		this.renderMore(this.showingMore ? '➖' : '➕');
	}

	private renderMore(text: string): void {
		this.statusBarMore.text = text;
		this.statusBarMore.color = 'white';
		this.statusBarMore.tooltip = this.showingMore ? 'Hide extra reactions' : 'Show more reactions';
		this.statusBarMore.command = this.more();
		this.statusBarMore.show();
	}
	
}
