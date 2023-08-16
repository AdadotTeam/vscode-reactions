import {StoreLineReaction, ValueOf, yourEmoji} from "../types/app";
import { ReactionEmojis } from "../types/reactions";
import store from "./store";

export const EMPTY_LINE_REACTION = (): StoreLineReaction => ({
    ids: new Set<string>(),
    ...store.reactionValues().reduce((acc, v)=>{
        acc[v] = 0;
        acc[`your${v}`] = 0;
        return acc;
    }, {} as {[key in yourEmoji]: number}&{[key in ValueOf<typeof ReactionEmojis>]: number})
} as StoreLineReaction);

export const APP_HANDLE = 'code-reactions';