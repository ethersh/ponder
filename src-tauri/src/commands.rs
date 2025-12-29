use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_DEPTH: usize = 10;
const MAX_NODES: usize = 50_000;
const LARGE_FILE_THRESHOLD: u64 = 2 * 1024 * 1024; // 2 MB
const DEFAULT_MAX_READ_BYTES: u64 = 200 * 1024; // 200 KB
const ALWAYS_IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    ".next",
    ".turbo",
    ".cache",
];

const ALLOWED_HIDDEN_DIRS: &[&str] = &[".github", ".vscode"];
const ALWAYS_IGNORED_FILES: &[&str] = &[".DS_Store"];
#[derive(Serialize, Clone, Debug)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_too_large: bool,
}
#[derive(Serialize)]
pub struct FileReadResult {
    pub content: String,
    pub size_bytes: u64,
    pub truncated: bool,
}
fn validate_path_within_root(path: &Path, root: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize root: {}", e))?;

    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    if canonical_path.starts_with(&canonical_root) {
        Ok(canonical_path)
    } else {
        Err("Path traversal detected: path is outside workspace root".to_string())
    }
}

fn to_relative_posix_path(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn should_ignore_entry(entry: &walkdir::DirEntry, root: &Path) -> bool {
    let name = entry.file_name().to_string_lossy();

    if entry.file_type().is_symlink() {
        if entry.file_type().is_file() {
            if let Ok(target) = fs::read_link(entry.path()) {
                let resolved = if target.is_absolute() {
                    target
                } else {
                    entry.path().parent().unwrap_or(entry.path()).join(&target)
                };
                if let Ok(canonical_target) = resolved.canonicalize() {
                    if let Ok(canonical_root) = root.canonicalize() {
                        return !canonical_target.starts_with(&canonical_root);
                    }
                }
            }
            return true;
        }
        return entry.file_type().is_dir();
    }

    if entry.file_type().is_dir() && ALWAYS_IGNORED_DIRS.contains(&name.as_ref()) {
        return true;
    }

    if entry.file_type().is_file() && ALWAYS_IGNORED_FILES.contains(&name.as_ref()) {
        return true;
    }

    if entry.file_type().is_dir() && name.starts_with('.') {
        return !ALLOWED_HIDDEN_DIRS.contains(&name.as_ref());
    }

    false
}

fn is_binary_file(path: &Path, check_bytes: usize) -> Result<bool, std::io::Error> {
    let file = fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(file);
    let mut buffer = vec![0u8; check_bytes];

    use std::io::Read;
    let bytes_read = reader.read(&mut buffer)?;
    buffer.truncate(bytes_read);

    Ok(buffer.contains(&0))
}

fn build_tree(
    root: &Path,
    canonical_root: &Path,
    node_count: &mut usize,
) -> Result<TreeNode, String> {
    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    let mut entries: Vec<walkdir::DirEntry> = Vec::new();

    for entry in WalkDir::new(root)
        .max_depth(MAX_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_ignore_entry(e, canonical_root))
    {
        if *node_count >= MAX_NODES {
            break;
        }

        match entry {
            Ok(e) => {
                if e.path() == root {
                    continue;
                }
                entries.push(e);
                *node_count += 1;
            }
            Err(_) => continue,
        }
    }

    let mut root_node = TreeNode {
        name: root_name,
        path: "".to_string(),
        node_type: "dir".to_string(),
        children: Some(Vec::new()),
        size_bytes: None,
        is_too_large: false,
    };

    entries.sort_by_key(|e| e.depth());

    let mut dir_map: std::collections::HashMap<PathBuf, Vec<TreeNode>> =
        std::collections::HashMap::new();
    dir_map.insert(root.to_path_buf(), Vec::new());

    for entry in entries {
        let entry_path = entry.path();
        let parent_path = entry_path.parent().unwrap_or(root);
        let name = entry.file_name().to_string_lossy().to_string();
        let rel_path = to_relative_posix_path(entry_path, root);

        let node = if entry.file_type().is_dir() {
            dir_map.insert(entry_path.to_path_buf(), Vec::new());
            TreeNode {
                name,
                path: rel_path,
                node_type: "dir".to_string(),
                children: Some(Vec::new()),
                size_bytes: None,
                is_too_large: false,
            }
        } else {
            let metadata = fs::metadata(entry_path);
            let (size_bytes, is_too_large) = match metadata {
                Ok(m) => {
                    let size = m.len();
                    (Some(size), size > LARGE_FILE_THRESHOLD)
                }
                Err(_) => (None, false),
            };

            TreeNode {
                name,
                path: rel_path,
                node_type: "file".to_string(),
                children: None,
                size_bytes,
                is_too_large,
            }
        };

        if let Some(children) = dir_map.get_mut(parent_path) {
            children.push(node);
        }
    }

    fn populate_children(
        node: &mut TreeNode,
        full_path: &Path,
        dir_map: &std::collections::HashMap<PathBuf, Vec<TreeNode>>,
        root: &Path,
    ) {
        if let Some(children) = dir_map.get(full_path) {
            let mut sorted_children: Vec<TreeNode> = children.clone();

            sorted_children.sort_by(|a, b| {
                match (&a.node_type[..], &b.node_type[..]) {
                    ("dir", "file") => std::cmp::Ordering::Less,
                    ("file", "dir") => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });

            for child in &mut sorted_children {
                if child.node_type == "dir" {
                    let child_path = if child.path.is_empty() {
                        root.to_path_buf()
                    } else {
                        root.join(&child.path.replace('/', std::path::MAIN_SEPARATOR_STR))
                    };
                    populate_children(child, &child_path, dir_map, root);
                }
            }

            node.children = Some(sorted_children);
        }
    }

    populate_children(&mut root_node, root, &dir_map, root);

    Ok(root_node)
}

#[tauri::command]
pub fn list_tree(root: String) -> Result<TreeNode, String> {
    let root_path = Path::new(&root);

    if !root_path.exists() {
        return Err(format!("Root path does not exist: {}", root));
    }

    if !root_path.is_dir() {
        return Err(format!("Root path is not a directory: {}", root));
    }

    let canonical_root = root_path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize root: {}", e))?;

    let mut node_count = 0;
    build_tree(&canonical_root, &canonical_root, &mut node_count)
}

#[tauri::command]
pub fn read_text_file(root: String, rel_path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let max_bytes = max_bytes.unwrap_or(DEFAULT_MAX_READ_BYTES);
    let root_path = Path::new(&root);

    let native_rel_path = rel_path.replace('/', std::path::MAIN_SEPARATOR_STR);
    let file_path = root_path.join(&native_rel_path);

    let canonical_path = validate_path_within_root(&file_path, root_path)?;

    if !canonical_path.is_file() {
        return Err(format!("Not a file: {}", rel_path));
    }

    let metadata = fs::metadata(&canonical_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    if metadata.len() > max_bytes {
        return Err(format!(
            "File too large: {} bytes (max: {} bytes)",
            metadata.len(),
            max_bytes
        ));
    }

    if is_binary_file(&canonical_path, 8192).unwrap_or(false) {
        return Err("Cannot display binary file".to_string());
    }

    let content = fs::read_to_string(&canonical_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_to_relative_posix_path() {
        let root = Path::new("/home/user/project");
        let path = Path::new("/home/user/project/src/main.rs");
        assert_eq!(to_relative_posix_path(path, root), "src/main.rs");
    }

    #[test]
    fn test_validate_path_within_root() {
        let temp_dir = env::temp_dir();
        let root = temp_dir.join("test_root");
        fs::create_dir_all(&root).ok();

        let valid_path = root.join("subdir");
        fs::create_dir_all(&valid_path).ok();

        // This should succeed
        let result = validate_path_within_root(&valid_path, &root);
        assert!(result.is_ok());

        // Clean up
        fs::remove_dir_all(&root).ok();
    }
}
