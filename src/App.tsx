import { useState, useEffect, useCallback } from "react";
import { FileTree } from "./components/FileTree";
import { FileViewer } from "./components/FileViewer";
import {
  TreeNode,
  selectFolder,
  listTree,
  readTextFile,
  saveWorkspacePath,
  loadWorkspacePath,
} from "./lib/tauri";
import "./App.css";

function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    async function loadLastWorkspace() {
      try {
        const lastPath = await loadWorkspacePath();
        if (lastPath) {
          await handleLoadTree(lastPath);
        }
      } catch (error) {
        console.error("Failed to load last workspace:", error);
      }
    }
    loadLastWorkspace();
  }, []);

  const handleLoadTree = useCallback(async (path: string) => {
    setTreeLoading(true);
    setTreeError(null);
    setTree(null);
    setWorkspacePath(path);
    setSelectedFilePath(null);
    setFileContent(null);
    setFileError(null);

    try {
      const treeData = await listTree(path);
      setTree(treeData);
      await saveWorkspacePath(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTreeError(message);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const handleConnectFolder = useCallback(async () => {
    try {
      const path = await selectFolder();
      if (path) {
        await handleLoadTree(path);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTreeError(`Failed to open folder picker: ${message}`);
    }
  }, [handleLoadTree]);

  const handleFileSelect = useCallback(
    async (relPath: string) => {
      if (!workspacePath) return;

      setSelectedFilePath(relPath);
      setFileLoading(true);
      setFileError(null);
      setFileContent(null);

      try {
        const content = await readTextFile(workspacePath, relPath);
        setFileContent(content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setFileError(message);
      } finally {
        setFileLoading(false);
      }
    },
    [workspacePath]
  );
  const displayPath = workspacePath
    ? workspacePath.length > 40
      ? "…" + workspacePath.slice(-38)
      : workspacePath
    : null;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">Ponder</h1>
        <span className="workspace-path" title={workspacePath || ""}>
          {displayPath || "No workspace selected"}
        </span>
        <div className="app-header-actions">
          <button
            className="connect-button"
            onClick={handleConnectFolder}
            disabled={treeLoading}
          >
            {treeLoading ? "Loading…" : "Connect folder"}
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className="app-sidebar">
          <FileTree
            tree={tree}
            selectedPath={selectedFilePath}
            onFileSelect={handleFileSelect}
            isLoading={treeLoading}
            error={treeError}
            searchFilter={searchFilter}
            onSearchChange={setSearchFilter}
          />
        </aside>

        <section className="app-content">
          <FileViewer
            content={fileContent}
            filePath={selectedFilePath}
            isLoading={fileLoading}
            error={fileError}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
