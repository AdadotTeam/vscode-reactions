import {ReactionEmojis, StoreLineReaction, ValueOf, yourEmoji} from "../types/app";

export const EMPTY_LINE_REACTION = (): StoreLineReaction => ({
    ids: new Set<string>(),
    ...Object.values(ReactionEmojis).reduce((acc, v)=>{
        acc[v] = 0;
        acc[`your${v}`] = 0;
        return acc;
    }, {} as {[key in yourEmoji]: number}&{[key in ValueOf<typeof ReactionEmojis>]: number})
});

export const APP_HANDLE = 'code-reactions';