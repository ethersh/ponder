import "./FileViewer.css";

interface FileViewerProps {
    content: string | null;
    filePath: string | null;
    isLoading?: boolean;
    error?: string | null;
}

function getLanguageFromPath(path: string): string {
    const extension = path.split(".").pop()?.toLowerCase() || "";
    const languageMap: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        mjs: "javascript",
        cjs: "javascript",
        html: "html",
        htm: "html",
        css: "css",
        scss: "scss",
        less: "less",
        json: "json",
        yaml: "yaml",
        yml: "yaml",
        toml: "toml",
        xml: "xml",
        rs: "rust",
        py: "python",
        rb: "ruby",
        go: "go",
        sh: "shell",
        bash: "shell",
        zsh: "shell",
        md: "markdown",
        mdx: "markdown",
        gitignore: "gitignore",
        env: "dotenv",
    };
    return languageMap[extension] || "plaintext";
}

function getFilename(path: string): string {
    return path.split("/").pop() || path;
}

export function FileViewer({
    content,
    filePath,
    isLoading = false,
    error = null,
}: FileViewerProps) {
    if (isLoading) {
        return (
            <div className="file-viewer-container">
                <div className="file-viewer-loading">
                    <span className="loading-spinner">⏳</span>
                    Loading file…
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="file-viewer-container">
                <div className="file-viewer-header">
                    {filePath && (
                        <span className="file-viewer-path" title={filePath}>
                            {getFilename(filePath)}
                        </span>
                    )}
                </div>
                <div className="file-viewer-error">
                    <span className="error-icon">⚠️</span>
                    <p className="error-title">Failed to read file</p>
                    <p className="error-message">{error}</p>
                </div>
            </div>
        );
    }

    if (!content && !filePath) {
        return (
            <div className="file-viewer-container">
                <div className="file-viewer-empty">
                    <span className="empty-icon">📝</span>
                    <p>Select a file to view its contents</p>
                </div>
            </div>
        );
    }

    const lines = content?.split("\n") || [];
    const lineNumberWidth = String(lines.length).length;
    const language = filePath ? getLanguageFromPath(filePath) : "plaintext";

    return (
        <div className="file-viewer-container">
            <div className="file-viewer-header">
                <span className="file-viewer-path" title={filePath || ""}>
                    📄 {filePath ? getFilename(filePath) : "Untitled"}
                </span>
                <span className="file-viewer-info">
                    <span className="file-viewer-language">{language}</span>
                    <span className="file-viewer-lines">{lines.length} lines</span>
                </span>
            </div>
            <div className="file-viewer-content">
                <pre className="file-viewer-pre">
                    <code className={`language-${language}`}>
                        {lines.map((line, index) => (
                            <div key={index} className="file-viewer-line">
                                <span
                                    className="file-viewer-line-number"
                                    style={{ width: `${lineNumberWidth}ch` }}
                                >
                                    {index + 1}
                                </span>
                                <span className="file-viewer-line-content">
                                    {line || " "}
                                </span>
                            </div>
                        ))}
                    </code>
                </pre>
            </div>
        </div>
    );
}

export default FileViewer;
