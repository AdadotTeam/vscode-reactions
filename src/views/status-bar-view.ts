import {Command, ConfigurationChangeEvent, StatusBarAlignment, StatusBarItem, ThemeColor, window,} from "vscode";
import {Details, ReactionEmojis, StoreLineReaction, ValueOf} from "../types/app";
import {PartialTextEditor} from "../util/vs-code";
import {StatusBarReaction} from "./status-bar-reaction";

import {APP_HANDLE} from "../util/constants";
import {getProminentReactions} from "../util/prominent-reactions";
import {configName, getProperty} from "../util/configuration";

const defaultReactions: (ValueOf<typeof ReactionEmojis>)[] = Object.values(ReactionEmojis);

export class StatusBarView {
	private statusBars: StatusBarReaction[] = [];
	private statusBarMore: StatusBarItem;
	public showingMore: boolean = false;
	private currentProminentReactions: (keyof StoreLineReaction)[] = defaultReactions.slice(0, getProperty("statusBarProminentReactionsAmount"));
	private timeout?: NodeJS.Timeout;

	constructor() {
		this.statusBars = this.createStatusBarItem();
		this.statusBarMore = window.createStatusBarItem(
			StatusBarAlignment.Right,
			this.statusBars.length - getProperty("statusBarProminentReactionsAmount"),
		);
	}

	public onDidChangeConfiguration(event: ConfigurationChangeEvent){
		if (event.affectsConfiguration(configName("statusBarReactionsEnabled"))) {
			if(getProperty("statusBarReactionsEnabled")){
				this.statusBars = this.createStatusBarItem();
				this.statusBarMore = window.createStatusBarItem(
					StatusBarAlignment.Right,
					this.statusBars.length - getProperty("statusBarProminentReactionsAmount"),
				);
			}else{
				this.clear();
				this.dispose();
			}
		}
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

	private showOnlyOne(text: string, tooltip: string, state?: 'warning' | 'error') {
		this.statusBars.forEach((bar, i)=>{
			if(i === 0){
				bar.renderStatic(text, tooltip, state);
			}else{
				bar.hide();
			}
		});
	}

	public async set(
		uncommitted: boolean,
		lineReactions: StoreLineReaction | undefined,
		editor: PartialTextEditor | undefined,
		linesSelected: number,
		details?: Details[]
	): Promise<void> {
		if(!getProperty("statusBarReactionsEnabled")){
			return;
		}
		if(this.timeout){
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		this.currentProminentReactions = getProminentReactions(lineReactions, getProperty("statusBarProminentReactionsAmount"));
		if (uncommitted) {
			this.showOnlyOne(getProperty("statusBarMessageNoCommit"), 'Can not react on an uncommitted line!');
		} else if (!lineReactions) {
			this.clear();
		} else {
			let prominentCounter = (this.statusBarMore.priority || 0)+this.currentProminentReactions.length;
			let nonProminentCounter = defaultReactions.length - this.currentProminentReactions.length;

			await Promise.all(this.currentProminentReactions.map(async (reaction)=>{
				const bar = this.statusBars.find(statusBar=> statusBar.emoji === reaction);
					await bar?.render(lineReactions, true, linesSelected, details, prominentCounter);
					prominentCounter -=1;

			}));

			await Promise.all(this.statusBars.map(async (bar)=>{
				const prominentIndex = this.currentProminentReactions.findIndex(reaction=> reaction === bar.emoji);
				if(prominentIndex === -1){
					await bar.render(lineReactions, this.showingMore, linesSelected, details, nonProminentCounter);
					nonProminentCounter -=1;
				}
			}));
			if(getProperty("statusBarProminentReactionsAmount") < Object.values(ReactionEmojis).length){
				this.renderMore(this.showingMore ? '➖' : '➕');
			}else{
				this.renderMore('');
			}
		}
	}

	private permanentError(): void {
		this.showOnlyOne(`😞`, 'Could not connect to get reactions. Will retry at some point again', 'error');
	}

	public setError(): void {
		if(!getProperty("statusBarReactionsEnabled")){
			return;
		}
		if(!this.timeout) {
			this.showOnlyOne(`🤔`, 'Struggling to get reactions. Will keep retrying silently', 'warning');
			this.timeout = setTimeout(() => {
				this.permanentError();
			}, 30000);
		}
	}

	public clear(): void {
		if(!getProperty("statusBarReactionsEnabled")){
			return;
		}
		this.statusBars.forEach(bar=> {
			bar.hide();
		});
		this.renderMore('');
	}

	public activity(): void {
		if(!getProperty("statusBarReactionsEnabled")) {
			return;
		}
		this.showOnlyOne("$(sync~spin) 🤔", 'Calculating Reactions...');
	}

	public dispose(): void {
		this.statusBars.forEach(bar=> {
			bar.dispose();
		});
		this.statusBarMore.dispose();
	}

	private more(): Command {
		return {
			title: `${APP_HANDLE}.more`,
			command: `${APP_HANDLE}.more`,
			arguments:[()=>this.toggleShowMore.bind(this)()]
		};
	}

	public toggleShowMore() {
		if(!getProperty("statusBarReactionsEnabled")) {
			return;
		}
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
		this.statusBarMore.color = new ThemeColor(`statusBarItem.prominentForeground`);
		this.statusBarMore.tooltip = this.showingMore ? 'Hide extra reactions' : 'Show more reactions';
		this.statusBarMore.command = this.more();
		this.statusBarMore.show();
	}
	
}
