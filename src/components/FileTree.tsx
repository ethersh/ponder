import { useState, useMemo } from "react";
import { TreeNode, formatFileSize } from "../lib/tauri";
import "./FileTree.css";

interface FileTreeProps {
    tree: TreeNode | null;
    selectedPath: string | null;
    onFileSelect: (path: string) => void;
    isLoading?: boolean;
    error?: string | null;
    searchFilter?: string;
    onSearchChange?: (filter: string) => void;
}

interface TreeNodeProps {
    node: TreeNode;
    selectedPath: string | null;
    onFileSelect: (path: string) => void;
    expandedPaths: Set<string>;
    toggleExpanded: (path: string) => void;
    searchFilter: string;
    depth: number;
}

function nodeMatchesFilter(node: TreeNode, filter: string): boolean {
    const lowerFilter = filter.toLowerCase();
    if (node.name.toLowerCase().includes(lowerFilter)) {
        return true;
    }
    if (node.children) {
        return node.children.some(child => nodeMatchesFilter(child, filter));
    }
    return false;
}

function getPathsToExpand(node: TreeNode, filter: string, parentPath: string = ""): Set<string> {
    const paths = new Set<string>();
    const currentPath = node.path || parentPath;

    if (node.children) {
        for (const child of node.children) {
            if (nodeMatchesFilter(child, filter)) {
                paths.add(currentPath);
                const childPaths = getPathsToExpand(child, filter, child.path);
                childPaths.forEach(p => paths.add(p));
            }
        }
    }

    return paths;
}

function TreeNodeItem({
    node,
    selectedPath,
    onFileSelect,
    expandedPaths,
    toggleExpanded,
    searchFilter,
    depth,
}: TreeNodeProps) {
    const isDir = node.node_type === "dir";
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedPath === node.path;

    const visibleChildren = useMemo(() => {
        if (!node.children) return [];
        if (!searchFilter) return node.children;
        return node.children.filter(child => nodeMatchesFilter(child, searchFilter));
    }, [node.children, searchFilter]);

    const handleClick = () => {
        if (isDir) {
            toggleExpanded(node.path);
        } else {
            onFileSelect(node.path);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
        }
    };

    if (depth === 0 && isDir) {
        return (
            <div className="file-tree-root">
                {visibleChildren.map((child) => (
                    <TreeNodeItem
                        key={child.path}
                        node={child}
                        selectedPath={selectedPath}
                        onFileSelect={onFileSelect}
                        expandedPaths={expandedPaths}
                        toggleExpanded={toggleExpanded}
                        searchFilter={searchFilter}
                        depth={depth + 1}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="file-tree-node">
            <div
                className={`file-tree-item ${isSelected ? "selected" : ""} ${isDir ? "directory" : "file"}`}
                style={{ paddingLeft: `${(depth - 1) * 16 + 8}px` }}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                role="treeitem"
                aria-expanded={isDir ? isExpanded : undefined}
                aria-selected={isSelected}
            >
                <span className="file-tree-icon">
                    {isDir ? (isExpanded ? "📂" : "📁") : "📄"}
                </span>
                <span className="file-tree-name" title={node.name}>
                    {node.name}
                </span>
                {!isDir && node.size_bytes !== undefined && (
                    <span className="file-tree-size">
                        {node.is_too_large ? "⚠️ " : ""}
                        {formatFileSize(node.size_bytes)}
                    </span>
                )}
            </div>

            {isDir && isExpanded && visibleChildren.length > 0 && (
                <div className="file-tree-children" role="group">
                    {visibleChildren.map((child) => (
                        <TreeNodeItem
                            key={child.path}
                            node={child}
                            selectedPath={selectedPath}
                            onFileSelect={onFileSelect}
                            expandedPaths={expandedPaths}
                            toggleExpanded={toggleExpanded}
                            searchFilter={searchFilter}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FileTree({
    tree,
    selectedPath,
    onFileSelect,
    isLoading = false,
    error = null,
    searchFilter = "",
    onSearchChange,
}: FileTreeProps) {
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [localSearchFilter, setLocalSearchFilter] = useState(searchFilter);

    useMemo(() => {
        if (localSearchFilter && tree) {
            const pathsToExpand = getPathsToExpand(tree, localSearchFilter);
            setExpandedPaths(prev => {
                const next = new Set(prev);
                pathsToExpand.forEach(p => next.add(p));
                return next;
            });
        }
    }, [localSearchFilter, tree]);

    const toggleExpanded = (path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLocalSearchFilter(value);
        onSearchChange?.(value);
    };

    if (isLoading) {
        return (
            <div className="file-tree-container">
                <div className="file-tree-loading">
                    <span className="loading-spinner">⏳</span>
                    Loading tree…
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="file-tree-container">
                <div className="file-tree-error">
                    <span className="error-icon">❌</span>
                    {error}
                </div>
            </div>
        );
    }

    if (!tree) {
        return (
            <div className="file-tree-container">
                <div className="file-tree-empty">
                    <span className="empty-icon">📁</span>
                    <p>No folder connected yet</p>
                    <p className="empty-hint">Click "Connect folder" to get started</p>
                </div>
            </div>
        );
    }

    return (
        <div className="file-tree-container">
            <div className="file-tree-search">
                <input
                    type="text"
                    placeholder="Search files..."
                    value={localSearchFilter}
                    onChange={handleSearchChange}
                    className="file-tree-search-input"
                />
                {localSearchFilter && (
                    <button
                        className="file-tree-search-clear"
                        onClick={() => {
                            setLocalSearchFilter("");
                            onSearchChange?.("");
                        }}
                        aria-label="Clear search"
                    >
                        ✕
                    </button>
                )}
            </div>
            <div className="file-tree-content" role="tree">
                <TreeNodeItem
                    node={tree}
                    selectedPath={selectedPath}
                    onFileSelect={onFileSelect}
                    expandedPaths={expandedPaths}
                    toggleExpanded={toggleExpanded}
                    searchFilter={localSearchFilter}
                    depth={0}
                />
            </div>
        </div>
    );
}

export default FileTree;
