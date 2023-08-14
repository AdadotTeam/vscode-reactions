import {DecorationOptions, Range, TextEditor, TextEditorDecorationType, ThemeColor, window, workspace,} from "vscode";
import {Details, ReactionEmojis, StoreLineReaction} from "../types/app";
import {getActiveTextEditor} from "../util/vs-code";
import {toAnnotationTextView, toHoverMarkdown} from "../util/textdecorator";
import {Blame} from "../git/file";
import {EMPTY_LINE_REACTION} from "../util/constants";
import {App} from "../app";
import {evaluateMapEquality} from "../util/map-equality";

export class AnnotateView {
    private decorationTypes: Map<number, TextEditorDecorationType> = new Map();
    public annotateIsOn = false;
    private blameCache?: Blame;
    private fileReactionsCache?: Map<string, StoreLineReaction>;
    private detailsCache?: Map<string, Details>;
    private readonly onReactionShow: App['onReactionShow'];

    constructor(onReactionShow: App['onReactionShow']) {
        this.onReactionShow = onReactionShow;
    }

    public toggleAnnotations() {
        this.annotateIsOn = !this.annotateIsOn;
        this.blameCache = undefined;
        this.fileReactionsCache = undefined;
    }

    public createFileDecoration(
        fileBlame: Blame | undefined,
        fileReactions: Map<string, StoreLineReaction> | undefined,
        editor: TextEditor,
        details?: Map<string, Details>
    ) {
        if (
            evaluateMapEquality(this.blameCache, fileBlame) &&
            evaluateMapEquality(this.fileReactionsCache, fileReactions) &&
            evaluateMapEquality(this.detailsCache, details)
        ) {
            return;
        }
        this.blameCache = fileBlame && new Map(JSON.parse(JSON.stringify(Array.from(fileBlame))));
        this.fileReactionsCache = fileReactions && new Map(JSON.parse(JSON.stringify(Array.from(fileReactions))));
        this.detailsCache = details && new Map(JSON.parse(JSON.stringify(Array.from(details))));
        if (!fileBlame) {
            this.removeAllDecorations();
            return;
        }
        const textEditor = getActiveTextEditor();
        let start: number = 0;
        let end: number = 0;
        textEditor?.visibleRanges.forEach(visibleRange => {
            start = visibleRange.start.line;
            end = visibleRange.end.line;
        });
        const distance = (a: number, t: number) => Math.abs(t - a);
        const renderFrom = (start && end) ? (start + end) / 2 : 0;
        const entries = Array.from(fileBlame?.entries()).sort((a, b) => distance(a[0], renderFrom) - distance(b[0], renderFrom));
        const shownReactions: { fileName: string; reaction: StoreLineReaction }[] = [];
        for (const [key, value] of entries) {
            let reaction: StoreLineReaction;
            if (!fileReactions) {
                reaction = EMPTY_LINE_REACTION()

            } else {
                reaction = fileReactions.get(`${value?.commit.hash}_${value?.line.source}`) || EMPTY_LINE_REACTION()
            }

            this.createLineDecoration(reaction, editor, key - 1);

            shownReactions.push({
                fileName: editor.document.fileName,
                reaction
            });
        }
        const workspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
        if (this.onReactionShow && workspaceFolder) {
            this.onReactionShow(workspaceFolder, shownReactions);
        }

    }

    private createLineDecoration(reactions: StoreLineReaction, editor: TextEditor, line: number): void {
        const decorationType = this.decorationTypes.get(line) || window.createTextEditorDecorationType({});

        const text = toAnnotationTextView(reactions);

        const any = Object.values(ReactionEmojis).find((emoji) => reactions[emoji] > 0);

        let details: Details[] = [];
        Array.from(reactions.ids).forEach(id => {
            if (this.detailsCache?.has(id)) {
                details.push(this.detailsCache.get(id) as Details);
            }
        });

        const renderOptions: DecorationOptions = {
            hoverMessage: toHoverMarkdown(details),
            renderOptions: {
                before: {
                    contentText: text,
                    // backgroundColor: 'lightgreen',
                    margin: `0 1em 0 1em`,
                    // width: '100 em',
                    // color: new ThemeColor("editorCodeLens.foreground"),
                    color: any ? new ThemeColor("editorCodeLens.foreground") : 'transparent',
                    // textDecoration:any?undefined:`text-shadow: 0 0 0 blue;`
                },
            },
            range: new Range(line, 0, line, 0),
        };

        editor.setDecorations?.(decorationType, [renderOptions]);
        this.decorationTypes.set(line, decorationType);
    }

    public removeAllDecorations(): void {
        for (const [, decorationType] of this.decorationTypes.entries()) {
            if (decorationType) {
                decorationType.dispose();
            }
        }
        this.decorationTypes = new Map();
    }

}
