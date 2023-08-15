import {relative, sep} from "node:path";
import { Repo } from "./repo";

export const getFileName = (repo: Repo | undefined, filePath: string) => {
    const a = relative(repo?.root.fsPath + '/', filePath);
    return a.split(sep).join('/');
};