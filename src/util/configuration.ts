import {workspace} from "vscode";
import {PropertiesMap} from "../types/app";
import {APP_HANDLE} from "./constants";

export const getProperty = <Key extends keyof PropertiesMap>(
    name: Key,
): PropertiesMap[Key] => {
    return workspace.getConfiguration('code-reactions').get(name) as PropertiesMap[Key];
};

export const configName = (
    name: keyof PropertiesMap,
): `code-reactions.${keyof PropertiesMap}` => `${APP_HANDLE}.${name}`;