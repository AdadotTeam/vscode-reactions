import { Commit } from "../types/app";

export function isUncomitted(commit: Commit): boolean {
	return /^0{40}$/.test(commit.hash);
}
