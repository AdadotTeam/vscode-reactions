import { Commit, CommitAuthor, FileAttachedCommit, Line, LineAttachedCommit } from "../types/app";
import { split } from "./split";


export type CommitRegistry = Map<string, Commit>;


const newCommitInfo = (hash: string): Commit => ({
	author: {
		mail: "",
		name: "",
		timestamp: "",
		date: new Date(),
		tz: "",
	},
	committer: {
		mail: "",
		name: "",
		timestamp: "",
		date: new Date(),
		tz: "",
	},
	hash: hash,
	summary: "",
});

const newLocationAttatchedCommit = (
	commitInfo: Commit,
): FileAttachedCommit => ({
	commit: commitInfo,
	filename: "",
});

function untilNextEventLoop(): Promise<void> {
	return new Promise(setImmediate);
}

const takeABreakEveryNthChunk = 25;

export async function* splitChunk(chunk: Buffer): AsyncGenerator<[string, string]> {
	let lastIndex = 0;
	while (lastIndex < chunk.length) {
		const nextIndex = chunk.indexOf("\n", lastIndex);

		yield split(chunk.toString("utf8", lastIndex, nextIndex));

		// This is an attempt to mitigate main thread hogging.
		if (nextIndex % takeABreakEveryNthChunk === 0) {
			await untilNextEventLoop();
		}

		lastIndex = nextIndex + 1;
	}
}

const fillOwner = (
	owner: CommitAuthor,
	dataPoint: string,
	value: string,
): void => {
	if (dataPoint === "time") {
		owner.timestamp = value;
		owner.date = new Date(parseInt(value, 10) * 1000);
	} else if (dataPoint === "tz") {
		owner[dataPoint] = value;
	} else if (dataPoint === "mail") {
		owner[dataPoint] = value.replace(/<|>/g, "");
	} else if (dataPoint === "") {
		owner.name = value;
	}
};

const processAuthorLine = (
	key: string,
	value: string,
	commitInfo: Commit,
): void => {
	const [author, dataPoint] = split(key, "-");

	if (author === "author" || author === "committer") {
		fillOwner(commitInfo[author], dataPoint, value);
	}
};

const isHash = (hash: string): boolean => /^\w{40}$/.test(hash);
const isCoverageLine = (hash: string, coverage: string): boolean =>
	isHash(hash) && /^\d+ \d+ \d+$/.test(coverage);

const processLine = (key: string, value: string, commitInfo: Commit): void => {
	if (key === "summary") {
		commitInfo.summary = value;
	} else if (isHash(key)) {
		commitInfo.hash = key;
	} else {
		processAuthorLine(key, value, commitInfo);
	}
};

function* processCoverage(coverage: string): Generator<Line> {
	const [source, result, lines] = coverage.split(" ").map(Number);

	for (let i = 0; i < lines; i++) {
		yield {
			source: source + i,
			result: result + i,
		};
	}
}

function* commitFilter(
	fileAttatched: FileAttachedCommit | undefined,
	lines: Generator<Line> | undefined,
	registry: CommitRegistry,
): Generator<LineAttachedCommit> {
	if (fileAttatched === undefined || lines === undefined) {
		return;
	}

	registry.set(fileAttatched.commit.hash, fileAttatched.commit);

	for (const line of lines) {
		yield {
			...fileAttatched,
			line,
		};
	}
}

export async function* processChunk(
	dataChunk: Buffer,
	commitRegistry: CommitRegistry,
): AsyncGenerator<LineAttachedCommit, void> {
	let commitLocation: FileAttachedCommit | undefined;
	let coverageGenerator: Generator<Line> | undefined;

	for await (const [key, value] of splitChunk(dataChunk)) {
		if (isCoverageLine(key, value)) {
			commitLocation = newLocationAttatchedCommit(
				commitRegistry.get(key) ?? newCommitInfo(key),
			);
			coverageGenerator = processCoverage(value);
		}

		if (commitLocation) {
			if (key === "filename") {
				commitLocation.filename = value;
				yield* commitFilter(commitLocation, coverageGenerator, commitRegistry);
			} else {
				processLine(key, value, commitLocation.commit);
			}
		}
	}

	yield* commitFilter(commitLocation, coverageGenerator, commitRegistry);
}

export async function* processStdout(
	data: AsyncIterable<Buffer> | null,
): AsyncGenerator<LineAttachedCommit, void> {
	const commitRegistry: CommitRegistry = new Map();
	for await (const chunk of data ?? []) {
		yield* processChunk(chunk, commitRegistry);
	}
}

export async function processStderr(
	data: AsyncIterable<string> | null,
): Promise<void> {
	for await (const error of data ?? []) {
		if (typeof error === "string") {
			throw new Error(error);
		}
	}
}