import { ChildProcess, spawn } from "node:child_process";
import { dirname } from "node:path";
import { lstatSync, existsSync } from "node:fs";

import { extensions } from "vscode";
import { GitExtension, LatestCommitInfo, UserInfo } from "../types/git";
import { execute } from "./execcommand";
import { getActiveTextEditor, validEditor } from "../util/vs-code";
import { Logger } from "../util/logger";
import { splitChunk } from "../util/std-process";


export const getGitCommand = (): string => {
	try{
		const vscodeGit = extensions.getExtension<GitExtension>("vscode.git");

		if (vscodeGit?.exports.enabled) {
			return vscodeGit.exports.getAPI(1).git.path;
		}
	}catch(e){
		// swallow
	}

	return "git";
};

const runGit = (cwd: string, ...args: string[]): Promise<string> =>{
	let dir = cwd;
	if(existsSync(cwd)){
		const stat = lstatSync(cwd);
		dir = stat.isDirectory() ? cwd : dirname(cwd);
	}
	return execute(getGitCommand(), args, { cwd: dir });
};

export const getActiveFileOrigin = async (
	remoteName: string,
): Promise<string> => {
	const activeEditor = getActiveTextEditor();

	if (!validEditor(activeEditor)) {
		return "";
	}

	return runGit(
		activeEditor.document.fileName,
		"ls-remote",
		"--get-url",
		remoteName,
	);
};

export const getCurrentBranch = async (fileName: string): Promise<string> => {
		return await runGit(
			fileName,
			"symbolic-ref",
			"-q",
			"--short",
			"HEAD",
		);

};

export const getCurrentCommit = async (fileName: string): Promise<LatestCommitInfo> => {
	let dir = fileName;
	if(existsSync(fileName)){
		const stat = lstatSync(fileName);
		dir = stat.isDirectory() ? fileName : dirname(fileName);
	}
		const process = spawn(getGitCommand(), ["log", '-1'], {
			cwd: dir,
		});

		const commitInfo: LatestCommitInfo = {};

		for await (const chunk of process.stdout ?? []) {
			for await (const [key, value] of splitChunk(chunk)) {
				if(key.length){
					if(key.endsWith(":")){
						const parsedKey = key.split(":")[0];
						if(parsedKey === 'Author'){
							const [name, email] = value.replace(/<|>/g, "").split(" ");
							commitInfo.author_email = email;
							commitInfo.author_name = name;
						} else if(parsedKey === 'Date'){
							const timeparts = value.trim().split(' ');
							const tz = timeparts[timeparts.length-1];
							commitInfo.datetime = value;
							commitInfo.tz = tz;
						}
					} else {
						if(key === 'commit'){
							commitInfo.sha = value;
						}
					} 
				} else if (!key.length && value.length){
					commitInfo.title = value;
				}
			}
		}
		return commitInfo;
};

export const getRemoteUrl = async (): Promise<string> => {
	const activeEditor = getActiveTextEditor();

	if (!validEditor(activeEditor)) {
		return "";
	}

	const { fileName } = activeEditor.document;
	const currentBranch = await getCurrentBranch(fileName);
	let curRemoteBranch = await runGit(
		fileName,
		"config",
		`branch.${currentBranch}.remote`,
	);
	let defaultBranch;
	if(!curRemoteBranch){
		defaultBranch = await getDefaultBranchName(fileName);
		if(defaultBranch !== currentBranch){
			curRemoteBranch = await runGit(
				fileName,
				"config",
				`branch.${defaultBranch}.remote`,
			);
		}
	}
	const remoteUrl = await runGit(
		fileName,
		"config",
		`remote.${curRemoteBranch || 'origin'}.url`,
	);
	return remoteUrl;
};

// this requires user to be online
export const validateReadAccess  = async (remoteUrl: string): Promise<boolean> => {
	const activeEditor = getActiveTextEditor();

	if (!validEditor(activeEditor)) {
		return false;
	}

	const { fileName } = activeEditor.document;

	try{
		const result = await runGit(
			fileName,
			"ls-remote",
			"--get-url",
			remoteUrl,
		);
	
		return !!result;
	}catch(e: any){
		return false;
	}
	
};

export const isCommitInCurrentBranch = async (branch: string, sha: string): Promise<boolean> => {
	const activeEditor = getActiveTextEditor();

	if (!validEditor(activeEditor)) {
		return false;
	}

	const { fileName } = activeEditor.document;

	const result = runGit(
		fileName,
		"branch",
		"--contains",
		sha,
		"--points-at",
		branch
	);

	return !!result;
};

// TODO merge the 2 below methods
export const getTopLevelLocalRepoDirectory = async (fileName: string): Promise<string> => runGit(
		fileName,
		"rev-parse",
		"--show-toplevel"
	);

export const getGitFolder = async (fileName: string): Promise<string> =>
	runGit(fileName, "rev-parse", "--git-dir");

export const isGitTracked = async (fileName: string): Promise<boolean> =>
	!!(await getGitFolder(fileName));

export const blameProcess = (realpathFileName: string, contents?: string): ChildProcess => {
	const args = [
		"blame", 
		// "-C", // works with copies accross the same file (causes duplicates)
		"--incremental", 
		"--", 
		realpathFileName
	];

	// if (getProperty("ignoreWhitespace")) {
	// 	args.splice(1, 0, "-w");
	// }

	if(contents){
		args.splice(3, 0, '--contents');
		args.splice(4, 0, '-');
	}

	Logger.info(`${getGitCommand()} ${args.join(" ")}`);

	const proc = spawn(getGitCommand(), args, {
		cwd: dirname(realpathFileName)
	});

	if(contents){
		proc.stdin?.end(contents, 'utf8' as BufferEncoding);
	}

	return proc;

};

export const getRelativePathOfActiveFile = async (): Promise<string> => {
	const activeEditor = getActiveTextEditor();

	if (!validEditor(activeEditor)) {
		return "";
	}

	const { fileName } = activeEditor.document;
	return runGit(fileName, "ls-files", "--full-name", "--", fileName);
};

export const getDefaultBranchName = async (dir: string): Promise<string> => {

	const rawRemoteDefaultBranch = await runGit(
		dir,
		"rev-parse",
		"--abbrev-ref",
		`origin/HEAD`,
	);

	return rawRemoteDefaultBranch.split("/")[1];
};

export const getUserInfo = async (dir: string): Promise<UserInfo> => {

	const [userName, userEmail] = await Promise.all([
		runGit(
		dir,
		"config",
		"user.name"
		),
		runGit(
			dir,
			"config",
			"user.email"
			)
	]);

	return {
		email: userEmail,
		name: userName
	};
};
