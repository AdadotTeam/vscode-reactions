export type CommitAuthor = {
    name: string;
    mail: string;
    timestamp: string;
    date: Date;
    tz: string;
};

export type Commit = {
    hash: string;
    author: CommitAuthor;
    committer: CommitAuthor;
    summary: string;
};

export type Line = {
    source: number;
    result: number;
};

export interface LineAttachedCommit extends FileAttachedCommit {
    line: Line;
}

export interface FileAttachedCommit {
    commit: Commit;
    filename: string;
}

export type PropertiesMap = {
	inlineMessageEnabled: boolean;
	inlineMessageMargin: number;
	inlineMessageNoCommit: string;
    inlineProminentReactionsAmount: number;
    statusBarReactionsEnabled: boolean;
	statusBarMessageNoCommit: string;
	statusBarProminentReactionsAmount: number;
	newReactionNotificationsEnabled: boolean;
    newReactionNotificationsOnlyOnMyLines: boolean;
    reactionsFeedEnabled: boolean;
};

export interface ProjectOpenEvent {
    branch_name: string;
    default_branch_name: string;
    current_sha?: string;
    current_sha_ts?: string;
    remote_url?: string;
    remote_access_validated: boolean;
    location_hash: string;
    name: string;
}

export enum ReactionEmojis {
    like = '👍',
    dislike = '👎',
    bug = '🐛',
    poop = '💩',
    rocket = '🚀',
    thinking = '🤔',
    heartEyes = '😍',
    eyes = '👀'
}

export interface ReactionAddEvent {
    action: "reaction";
    reactions: {
        id: string;
        project_id: string;
        reaction_action: "add";
        type: ReactionEmojis;
        branch: string;
        content?: string;
        current_sha: string;
        current_line: number;
        current_datetime: string;
        original_sha: string;
        original_line: number;
        original_timestamp: string;
        author_email_sha: string;
        author_name: string;
        committer_email_sha: string;
        committer_name: string;
        file_name: string;
        language: string;
        reaction_group_id: string;
    }[]
}


export interface NewReactionAddEvent {
    action: ReactionAddEvent['action'];
    reactions: Omit<ReactionAddEvent['reactions'][number], 'id'>[];
}

export interface ReactionStatusEvent {
    action: "reaction-status";
    reactions: {
        id: string;
        status: "overwrite" | "existing" | "seen";
        branch?: string;
        sha?: string;
        datetime?: string;
        author_email_sha?: string;
        author_name?: string;
    }[]
}

export interface ReactionDetailsRequest {
    action: "reaction-details";
    reactions: { id: string; }[]
}

export interface ProjectInfo extends ProjectOpenEvent {
    id: string;
    user_id: string;
    created_at: string;
}

export interface ProjectInfoResponse {
    type: 'projects'
    projects: ProjectInfo[]
}

export type ValueOf<T> = T[keyof T];

export type yourEmoji = `your${ValueOf<typeof ReactionEmojis>}`;

export type LineReaction = {
    project_id: string;
    id: string;
    content: string;
    original_sha_line: string;
    file_name: string;
} & {
    [key in yourEmoji]: number
} & {
    [key in ValueOf<typeof ReactionEmojis>]: number
};

export interface ProjectReactionsResponse {
    type: 'reactions'
    reactions: (Pick<ReactionAddEvent['reactions'][number], 'type' | 'original_sha' | 'original_line' | 'file_name' | 'project_id' | 'id' | 'content'> & {
        your_reaction: boolean;
        your_line: boolean
    })[]
}

export interface ProjectReactionsInitialResponse {
    type: 'init-reactions'
    reactions: (Omit<LineReaction, 'id' | 'content'> & { ids: string[] })[]
}

export interface Details {
    id: string;
    content: string;
    ts: string;
    name: string;
    type: ValueOf<ReactionEmojis>;
    seen: boolean;
    reaction_group_id: string;
    branch: string;
}

export interface DetailsResponse {
    type: "details";
    reactions: Details[]
}

export type StoreLineReaction = (Omit<LineReaction, 'project_id' | 'original_sha_line' | 'file_name' | 'id' | 'content'> & {
    ids: Set<string>
});