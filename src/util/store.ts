import { ConfigurationChangeEvent, window, StatusBarAlignment, commands } from "vscode";
import {ProjectInfoResponse, ValueOf} from "../types/app";
import { ReactionEmojis, ReactionEmojisInverse } from "../types/reactions";
import { configName, getProperty } from "./configuration";
import { APP_HANDLE } from "./constants";

type DefaultReactionsUpdateCallbackFunction = () => void;
class Store {
    public workspaceInfo = new Map<string, ProjectInfoResponse['projects'][number]>();
    private defaultReactions: Map<keyof typeof ReactionEmojis, ValueOf<typeof ReactionEmojis>> = new Map()
    private onDefaultReactionsUpdateCallback: DefaultReactionsUpdateCallbackFunction = () => undefined;

    reactionValues(): string[]{
        return Array.from(this.defaultReactions.values())
    }

    public onDefaultReactionsUpdate(callback: DefaultReactionsUpdateCallbackFunction) {
        this.onDefaultReactionsUpdateCallback = () => callback();
    }

    private updateDefaultReactions(newDefaults: Map<keyof typeof ReactionEmojis, ValueOf<typeof ReactionEmojis>>){
        this.defaultReactions = newDefaults;
        if(this.onDefaultReactionsUpdateCallback){
            this.onDefaultReactionsUpdateCallback();
        }
        
    }

    public setReactions(){
			const mainEmojis = getProperty('mainReactions').split(',').map(r=>r.trim()) as ValueOf<typeof ReactionEmojis>[];

            const newDefaults: Map<keyof typeof ReactionEmojis, ValueOf<typeof ReactionEmojis>> = new Map();

            mainEmojis.map(emoji=>{
                const name = ReactionEmojisInverse[emoji]
                if(name){
                    commands.executeCommand('setContext', `${APP_HANDLE}.${name}`, true);
                    newDefaults.set(name, emoji);
                }
            });

            for (const [name, emoji] of this.defaultReactions.entries()){
                if(!mainEmojis.includes(emoji)){
                    commands.executeCommand('setContext', `${APP_HANDLE}.${name}`, true);
                }
            }

            this.updateDefaultReactions(newDefaults);
    }

    public onDidChangeConfiguration(event: ConfigurationChangeEvent){
		if (event.affectsConfiguration(configName("mainReactions"))) {
            this.setReactions();
		}
	}
}

const store = new Store();
export default store;