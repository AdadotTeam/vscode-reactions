import {commands, ExtensionContext, window} from 'vscode';
import {App} from './app';
import {FeedViewProvider} from './views/feed-view';

import {APP_HANDLE} from "./util/constants";
import {Logger} from "./util/logger";
import {getProperty} from "./util/configuration";
import { ReactionEmojis } from "./types/reactions";
import store from './util/store';

const registerCommand = (subscriptions: ExtensionContext['subscriptions'])=>(name: string, callback: (...args: any[]) => any) => {
    subscriptions.push(commands.registerCommand(`${APP_HANDLE}.${name}`, callback));
};

export async function activate({subscriptions, extensionUri}: ExtensionContext) {

    const app = new App(extensionUri);

    subscriptions.push(app);
    subscriptions.push(Logger.getInstance());

    Object.keys(ReactionEmojis).forEach(emojiName => {
        registerCommand(subscriptions)(emojiName, app.registerReaction.bind(app));
        registerCommand(subscriptions)(`${emojiName}WithContent`, app.registerReactionWithContent(ReactionEmojis[emojiName as keyof typeof ReactionEmojis]).bind(app));
    });

    store.setReactions();

    registerCommand(subscriptions)('react',async () => { 
        const pick = await window.showQuickPick(
            // @ts-ignore
            Object.keys(ReactionEmojis).map((name)=>`:${name}: ${ReactionEmojis[name]}`), 
            {title:'React!', canPickMany:false
        });
        console.log(pick);
    });

    registerCommand(subscriptions)('reactWithComment',async () => { 
        const pick = await window.showQuickPick(
            // @ts-ignore
            Object.keys(ReactionEmojis).map((name)=>`:${name}: ${ReactionEmojis[name]}`), 
            {title:'Pick Reaction', canPickMany:false
        });
        console.log(pick);
        const content = await window.showInputBox({
            title: 'Add your comment for this reaction'
        });
        console.log(pick);
            console.log(content)
    });

    registerCommand(subscriptions)('more',(showMore) => { showMore(); });

    registerCommand(subscriptions)('annotate', app.toggleAnnotations.bind(app));

    subscriptions.push(window.registerWebviewViewProvider(FeedViewProvider.viewType, app.feedViewProvider));

    commands.executeCommand('setContext', `${APP_HANDLE}.reactionsFeedEnabled`, getProperty("reactionsFeedEnabled"));   
}