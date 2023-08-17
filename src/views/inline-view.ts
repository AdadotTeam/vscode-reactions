import {
	ConfigurationChangeEvent,
	Disposable,
	Position,
	Range,
	TextEditorDecorationType,
	ThemeColor,
	window,
	workspace,
} from "vscode";
import {Details, StoreLineReaction} from "../types/app";
import {getActiveTextEditor, PartialTextEditor} from "../util/vs-code";
import {toHoverMarkdown, toInlineTextView} from "../util/textdecorator";
import {getProminentReactions} from "../util/prominent-reactions";
import {configName, getProperty} from "../util/configuration";

export class InlineView {
	private readonly decorationType: TextEditorDecorationType;

	constructor() {
		this.decorationType = window.createTextEditorDecorationType({});
	}

	public onDidChangeConfiguration(event: ConfigurationChangeEvent){
		if (event.affectsConfiguration(configName("inlineMessageEnabled"))) {
			if(!getProperty("inlineMessageEnabled")){
				this.clear();
				this.dispose();
			}
		}
	}

	private async createLineDecoration(text: string, editor?: PartialTextEditor, details?: Details[]): void {
		if(!editor || !getProperty("inlineMessageEnabled")){
			return;
		}

		const margin = getProperty("inlineMessageMargin");
		const decorationPosition = new Position(
			editor.selection.active.line,
			Number.MAX_SAFE_INTEGER,
		);

		this.removeLineDecoration();
		const hoverMessage = await toHoverMarkdown(details);
		
		editor.setDecorations?.(this.decorationType, [
			{
				hoverMessage,
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

	public async set(
		uncommitted: boolean,
		lineReactions: StoreLineReaction | undefined,
		editor: PartialTextEditor | undefined,
		linesSelected: number,
		details?: Details[]
	): Promise<void> {
		if(!getProperty("inlineMessageEnabled")){
			return;
		}
		if(!lineReactions){
			this.clear();
		}else if(uncommitted){
				await this.createLineDecoration(getProperty("inlineMessageNoCommit"), editor);
		}else{
			const prominentReactions = getProminentReactions(lineReactions, getProperty("inlineProminentReactionsAmount"));
			await this.createLineDecoration(toInlineTextView(lineReactions, prominentReactions), editor, details);
		}
	}

	public clear(): void {
		if(!getProperty("inlineMessageEnabled")){
			return;
		}
		this.removeLineDecoration();
	}

	public dispose(): void {
		this.decorationType.dispose();
	}
}
