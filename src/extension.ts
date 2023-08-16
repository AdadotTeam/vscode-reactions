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

    registerCommand(subscriptions)('more',(showMore) => { showMore(); });

    registerCommand(subscriptions)('annotate', app.toggleAnnotations.bind(app));

    subscriptions.push(window.registerWebviewViewProvider(FeedViewProvider.viewType, app.feedViewProvider));

    commands.executeCommand('setContext', `${APP_HANDLE}.reactionsFeedEnabled`, getProperty("reactionsFeedEnabled"));
    // @ts-ignore
    // const picks = await window.showQuickPick(Object.keys(ReactionEmojis).map((name)=>`:${name}: ${ReactionEmojis[name]}`), {title:'React!', canPickMany:true});
    // console.log(picks)
}