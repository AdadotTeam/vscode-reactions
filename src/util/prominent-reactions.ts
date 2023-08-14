import {ReactionEmojis, StoreLineReaction, ValueOf} from "../types/app";

const defaultReactions: (ValueOf<typeof ReactionEmojis>)[] = Object.values(ReactionEmojis);

export const getProminentReactions = (lineReactions: StoreLineReaction | undefined, prominentReactionsLimit: number):(keyof StoreLineReaction)[] => {
    if(!lineReactions) {
        return defaultReactions.slice(0, prominentReactionsLimit);
    }
    const keysSorted = Object.values(ReactionEmojis)
        .filter(key => lineReactions[key]>0)
        .sort((a,b)=>lineReactions[a]-lineReactions[b]);

    if(keysSorted.length < prominentReactionsLimit) {
        const allReactions = [
            ...keysSorted,
            ...defaultReactions.filter(r=> !keysSorted.includes(r))
        ];
        return allReactions.slice(0, prominentReactionsLimit) as (keyof StoreLineReaction)[];
    }
    return keysSorted.slice(0, prominentReactionsLimit) as (keyof StoreLineReaction)[];
}