import {MarkdownString} from "vscode";
import {Details, StoreLineReaction, ValueOf} from "../types/app";
import {format} from "timeago.js";
import { ReactionEmojis } from "../types/reactions";
import store from "./store";

type InfoTokenFunctionWithParameter = (value?: string) => string | number;
type InfoTokenFunction = InfoTokenFunctionWithParameter | string | number;

export type InfoTokens = {
	[key: string]: InfoTokenFunction | undefined;
};

type TokenReplaceGroup = [InfoTokenFunction, string?, string?];

export const normalizeLineReactions = (lineReactions: StoreLineReaction): {[key in ValueOf<typeof ReactionEmojis>]: number} => {
	return Object.keys(lineReactions).reduce((acc, key) => {
		if (key === 'id') {
			return acc;
		}
		return {
			...acc,
			[key]: lineReactions[key as keyof typeof ReactionEmojis]
		};
	}, {} as { [key in ValueOf<typeof ReactionEmojis>]: number });
};

enum MODE {
	OUT = 0,
	IN = 1,
	START = 2,
}

const createIndexOrEnd =
	(target: string, index: number, endIndex: number) => (char: string) => {
		const indexOfChar = target.indexOf(char, index);
		if (indexOfChar === -1 || indexOfChar > endIndex) {
			return endIndex;
		}

		return indexOfChar;
	};
const createSubSectionOrEmpty =
	(target: string, endIndex: number) =>
	(startIndex: number, lastIndex: number) => {
		if (lastIndex === startIndex || endIndex === startIndex) {
			return "";
		}

		return target.substring(startIndex + 1, lastIndex);
	};

function createTokenReplaceGroup<T extends InfoTokens>(
	infoTokens: T,
	target: string,
	index: number,
): TokenReplaceGroup {
	const endIndex = target.indexOf("}", index);
	const indexOrEnd = createIndexOrEnd(target, index, endIndex);
	const subSectionOrEmpty = createSubSectionOrEmpty(target, endIndex);

	const parameterIndex = indexOrEnd(",");
	const modifierIndex = indexOrEnd("|");
	const functionName = target.substring(
		index,
		Math.min(parameterIndex, modifierIndex),
	);

	return [
		infoTokens[functionName] ?? functionName,
		subSectionOrEmpty(modifierIndex, endIndex),
		subSectionOrEmpty(parameterIndex, modifierIndex),
	];
}

function* parse<T extends InfoTokens>(
	target: string,
	infoTokens: T,
): Generator<TokenReplaceGroup> {
	let lastSplit = 0;
	let startIndex = 0;
	let mode = MODE.OUT;

	for (let index = 0; index < target.length; index++) {
		if (mode === MODE.OUT && target[index] === "$") {
			mode = MODE.START;
		} else if (mode === MODE.START && target[index] === "{") {
			mode = MODE.IN;
			startIndex = index - 1;
			yield [target.slice(lastSplit, startIndex)];
			lastSplit = startIndex;
		} else if (mode === MODE.START) {
			mode = MODE.OUT;
		} else if (mode === MODE.IN) {
			mode = MODE.OUT;
			const endIndex = target.indexOf("}", index);
			if (endIndex === -1) {
				break;
			}

			yield createTokenReplaceGroup(infoTokens, target, index);

			lastSplit = endIndex + 1;
		}
	}

	yield [target.slice(lastSplit)];
}

const modify = (value: string | number, modifier = ""): string => {
	if (modifier === "u") {
		return (value.toString()).toUpperCase();
	}
	if (modifier === "l") {
		return (value.toString()).toLowerCase();
	}
	if (modifier) {
		return `${value}|${modifier}`;
	}

	return (value.toString());
};

const sanitizeToken = (token: string): string => {
	return token.replace(/\u202e/g, "");
};

export const parseTokens = <T extends InfoTokens>(
	target: string,
	infoTokens: T,
): string => {
	let out = "";

	for (const [funcStr, mod, param] of parse(target, infoTokens)) {
		if (typeof funcStr === "string" || typeof funcStr === "number") {
			out += modify(funcStr, mod);
		} else {
			out += modify(funcStr(param), mod);
		}
	}

	return sanitizeToken(out);
};

export const toInlineTextView = (lineReactions: StoreLineReaction, prominentReactions: (keyof StoreLineReaction)[]): string =>
	parseTokens(
		prominentReactions.map(emoji=>`${emoji} \${${emoji}}`).join(' '),
		// "👍 ${👍} 👎 ${👎}",
		normalizeLineReactions(lineReactions),
	);

export const toAnnotationTextView = (lineReactions: StoreLineReaction): string =>
parseTokens(
	store.reactionValues().map(emoji=>`${emoji} \${${emoji}}`).join(' '),
	// "👍 ${👍} 👎 ${👎}",
	normalizeLineReactions(lineReactions),
);

export const toHoverMarkdown = (details?: Details[]) => {
	const groups = details?.reduce((acc, detail)=>{
		if(!acc[detail.reaction_group_id]){
			acc[detail.reaction_group_id] = {
				name: detail.name,
				type: detail.type,
				ts: detail.ts,
				content: detail.content,
				count: 0
			};
		}
		acc[detail.reaction_group_id].count += 1;
		return acc;
	}, {} as {[group:string]:{name:string;type:ValueOf<typeof ReactionEmojis>;ts:string;content:string;count:number}});
	const markdownString = new MarkdownString();
		markdownString.supportHtml = true;
		markdownString.appendMarkdown('<span style="color:#f4f40b;background-color:#666;">Reactions</span>');
		if(groups && Object.values(groups).length){
			Object.values(groups).forEach(group => {
				markdownString.appendMarkdown(`<br/>`);
				markdownString.appendMarkdown(`<span style="color:#f00;background-color:#fff;">${group.name} reacted with ${group.type} ${format(new Date(group.ts))}${group.content ? ` "${group.content}"` : ''}${group.count>1?` on ${group.count} lines`:''}</span>`);
			});
		}else{
			markdownString.appendMarkdown(`<br/>`);
				markdownString.appendMarkdown(`<span style="color:#f00;background-color:#fff;">No reactions for this line</span>`);
		}
		return markdownString;
};
