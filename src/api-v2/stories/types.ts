export interface CopyProgress {
    current: number;
    total: number;
    currentStory: string;
    status: "pending" | "copying" | "done" | "error";
    error?: string;
}

export interface CopyResult {
    success: boolean;
    copiedCount: number;
    errors: string[];
}

export interface StoryTreeNode {
    id: number;
    name: string;
    slug: string;
    full_slug: string;
    is_folder: boolean;
    is_startpage: boolean;
    parent_id: number | null;
    children: StoryTreeNode[];
    story: any;
}

export interface FetchStoriesResult {
    stories: any[];
    tree: StoryTreeNode[];
    total: number;
}
