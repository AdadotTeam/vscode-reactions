import { window } from "vscode";
import type {
	Position as FullPosition,
	TextDocument,
	TextEditor,
} from "vscode";

export type Document = Pick<TextDocument, "uri" | "isUntitled" | "fileName">;
export type Position = Pick<FullPosition, "line">;
export type PartialSelection = {
	active: Position;
};
export type PartialTextEditor = {
	readonly document: Document;
	selection: PartialSelection;

	setDecorations?: TextEditor["setDecorations"];
};

export const validEditor = (
	editor?: PartialTextEditor,
): editor is PartialTextEditor => editor?.document.uri.scheme === "file";

export const getActiveTextEditor = (): TextEditor | undefined =>
	window.activeTextEditor;

export const NO_FILE_OR_PLACE = "N:-1";

export const getFilePosition = ({
	document,
	selection,
}: PartialTextEditor): string =>
	document.uri.scheme !== "file"
		? NO_FILE_OR_PLACE
		: `${document.fileName}:${selection.active.line}`;
