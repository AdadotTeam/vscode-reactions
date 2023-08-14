import {commands, ExtensionContext, window} from 'vscode';
import {App} from './app';
import {FeedViewProvider} from './views/feed-view';
import {ReactionEmojis} from "./types/app";

import {APP_HANDLE} from "./util/constants";

const registerCommand = (subscriptions: ExtensionContext['subscriptions'])=>(name: string, callback: (...args: any[]) => any) => {
    subscriptions.push(commands.registerCommand(`${APP_HANDLE}.${name}`, callback));
};

export async function activate({subscriptions, extensionUri}: ExtensionContext) {

    const provider = new FeedViewProvider(extensionUri);

    const app = new App(provider);

    Object.keys(ReactionEmojis).forEach(emojiName =>{
        registerCommand(subscriptions)(emojiName, app.registerReaction.bind(app));
        registerCommand(subscriptions)(`${emojiName}WithContent`, app.registerReactionWithContent(ReactionEmojis[emojiName as keyof typeof ReactionEmojis]).bind(app));
    });

    registerCommand(subscriptions)('more',(showMore) => { showMore(); });

    registerCommand(subscriptions)('annotate', app.toggleAnnotations.bind(app));

    subscriptions.push(window.registerWebviewViewProvider(FeedViewProvider.viewType, provider));
}