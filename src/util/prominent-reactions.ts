import {StoreLineReaction, ValueOf} from "../types/app";
import store from "./store";

export const getProminentReactions = (lineReactions: StoreLineReaction | undefined, prominentReactionsLimit: number):(keyof StoreLineReaction)[] => {
    const defaultReactions = store.reactionValues();
    if(!lineReactions) {
        return defaultReactions.slice(0, prominentReactionsLimit);
    }
    const keysSorted = Object.values(defaultReactions)
        .filter(key => lineReactions[key]>0)
        .sort((a,b)=>lineReactions[b] - lineReactions[a]);

    if(keysSorted.length < prominentReactionsLimit) {
        const allReactions = [
            ...keysSorted,
            ...defaultReactions.filter(r=> !keysSorted.includes(r))
        ];
        return allReactions.slice(0, prominentReactionsLimit) as (keyof StoreLineReaction)[];
    }
    return keysSorted.slice(0, prominentReactionsLimit) as (keyof StoreLineReaction)[];
};