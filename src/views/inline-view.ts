import {Disposable, Position, Range, TextEditorDecorationType, ThemeColor, window, workspace,} from "vscode";
import {Details, getProperty, ReactionEmojis, StoreLineReaction, ValueOf} from "../types/app";
import {getActiveTextEditor, PartialTextEditor} from "../util/vs-code";
import {toHoverMarkdown, toInlineTextView} from "../util/textdecorator";

import {APP_HANDLE} from "../util/constants";

const defaultReactions: (ValueOf<typeof ReactionEmojis>)[] = Object.values(ReactionEmojis);

export class InlineView {
	private readonly decorationType: TextEditorDecorationType;
	private readonly configChange: Disposable;
	private currentProminentReactions: (keyof StoreLineReaction)[] = defaultReactions.slice(0, getProperty("statusBarProminentReactions"));

	constructor() {
		this.decorationType = window.createTextEditorDecorationType({});
		this.configChange = workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(APP_HANDLE)) {
				//
			}
		});
	}

	private createLineDecoration(text: string, editor?: PartialTextEditor, details?: Details[]): void {
		if(!editor || !getProperty("inlineMessageEnabled")){
			return;
		}

		const margin = getProperty("inlineMessageMargin");
		const decorationPosition = new Position(
			editor.selection.active.line,
			Number.MAX_SAFE_INTEGER,
		);

		this.removeLineDecoration();
		
		editor.setDecorations?.(this.decorationType, [
			{
				hoverMessage: toHoverMarkdown(details),
				renderOptions: {
					after: {
						contentText: text,
						margin: `0 0 0 ${margin}rem`,
						color: new ThemeColor("editorCodeLens.foreground"),
					},
				},
				range: new Range(decorationPosition, decorationPosition),
			},
		]);

	}

	private removeLineDecoration(): void {
		const editor = getActiveTextEditor();
		editor?.setDecorations?.(this.decorationType, []);
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

	public set(
		uncommitted: boolean,
		lineReactions: StoreLineReaction | undefined,
		editor: PartialTextEditor | undefined,
		linesSelected: number,
		details?: Details[]
	): void {
		if(!lineReactions){
			this.clear();
		}else if(uncommitted){
				this.createLineDecoration(getProperty("inlineMessageNoCommit"), editor);
		}else{
			const prominentReactions = this.prominentReactions(lineReactions);
			this.createLineDecoration(toInlineTextView(lineReactions, prominentReactions), editor, details);
		}
	}

	public clear(): void {
		this.removeLineDecoration();
	}

	public dispose(): void {
		this.decorationType.dispose();
		this.configChange.dispose();
	}
}
