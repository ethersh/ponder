import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { load, Store } from "@tauri-apps/plugin-store";

export interface TreeNode {
    name: string;
    path: string;
    node_type: "file" | "dir";
    children?: TreeNode[];
    size_bytes?: number;
    is_too_large?: boolean;
}

export interface WorkspaceState {
    lastWorkspacePath?: string;
}

const STORE_NAME = "ponder-workspace.json";
let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
    if (!storeInstance) {
        storeInstance = await load(STORE_NAME, { autoSave: true });
    }
    return storeInstance;
}

export async function saveWorkspacePath(path: string): Promise<void> {
    const store = await getStore();
    await store.set("lastWorkspacePath", path);
    await store.save();
}

export async function loadWorkspacePath(): Promise<string | null> {
    try {
        const store = await getStore();
        const path = await store.get<string>("lastWorkspacePath");
        return path ?? null;
    } catch {
        return null;
    }
}

export async function selectFolder(): Promise<string | null> {
    const result = await open({
        directory: true,
        multiple: false,
        title: "Select workspace folder",
    });

    if (typeof result === "string") {
        return result;
    }
    return null;
}

export async function listTree(root: string): Promise<TreeNode> {
    return invoke<TreeNode>("list_tree", { root });
}

export async function readTextFile(
    root: string,
    relPath: string,
    maxBytes?: number
): Promise<string> {
    return invoke<string>("read_text_file", {
        root,
        relPath,
        maxBytes,
    });
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
}

export function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1 || lastDot === 0) {
        return "";
    }
    return filename.slice(lastDot + 1).toLowerCase();
}
