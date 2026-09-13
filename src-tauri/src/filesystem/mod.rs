use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;
pub type Result<T> = std::result::Result<T, ServiceError>;

#[derive(Debug, Serialize)]
pub struct ServiceError {
    pub code: &'static str,
    pub message: String,
}
impl ServiceError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for ServiceError {
    fn from(error: std::io::Error) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::NotFound => "NOT_FOUND",
            std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            std::io::ErrorKind::AlreadyExists => "ALREADY_EXISTS",
            _ => "IO_ERROR",
        };
        Self::new(code, error.to_string())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: &'static str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub content: String,
    pub revision: String,
    pub bom: bool,
}

#[derive(Default)]
pub struct FileSystemService {
    root: Option<PathBuf>,
    workspace: Option<Workspace>,
    generation: u64,
}

fn is_link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}

fn check_chain(path: &Path) -> Result<()> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        if matches!(component, Component::Prefix(_) | Component::RootDir) {
            continue;
        }
        if is_link(&fs::symlink_metadata(&current)?) {
            return Err(ServiceError::new(
                "LINK_NOT_ALLOWED",
                "Symbolic links and junctions are not supported.",
            ));
        }
    }
    Ok(())
}

fn check_containment(root: &Path, path: &Path) -> Result<()> {
    check_chain(root)?;
    check_chain(path)?;
    if !fs::canonicalize(path)?.starts_with(fs::canonicalize(root)?) {
        return Err(ServiceError::new(
            "INVALID_PATH",
            "Path escapes the workspace.",
        ));
    }
    Ok(())
}

// Project metadata may not exist yet. Validate the nearest existing ancestor using
// the same containment and link checks as editor operations, without following links.
pub(crate) fn metadata_path(root: &Path, relative: &str) -> Result<PathBuf> {
    validate_relative(relative)?;
    let path = root.join(relative);
    let mut existing = path.as_path();
    loop {
        match fs::symlink_metadata(existing) {
            Ok(_) => break,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && existing != root => {
                existing = existing
                    .parent()
                    .ok_or_else(|| ServiceError::new("INVALID_PATH", "Invalid parent."))?;
            }
            Err(error) => return Err(error.into()),
        }
    }
    check_containment(root, existing)?;
    Ok(path)
}

pub fn valid_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    !(name.is_empty()
        || name == "."
        || name == ".."
        || name.ends_with([' ', '.'])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"|?*".contains(c))
        || ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit()))
}

fn validate_relative(relative: &str) -> Result<()> {
    if relative.is_empty() {
        return Ok(());
    }
    if relative.contains('\\') || relative.split('/').any(|name| !valid_name(name)) {
        return Err(ServiceError::new(
            "INVALID_PATH",
            "Use a relative path with valid file names inside the workspace.",
        ));
    }
    if Path::new(relative)
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(ServiceError::new(
            "INVALID_PATH",
            "The path must stay inside the workspace.",
        ));
    }
    Ok(())
}

fn bytes(path: &Path) -> Result<Vec<u8>> {
    let file = fs::File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(ServiceError::new("NOT_FILE", "Select a regular file."));
    }
    let mut result = Vec::new();
    file.take(MAX_FILE_SIZE + 1).read_to_end(&mut result)?;
    if result.len() as u64 > MAX_FILE_SIZE {
        return Err(ServiceError::new(
            "TOO_LARGE",
            "Files larger than 10 MiB are not supported.",
        ));
    }
    Ok(result)
}
fn revision(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

impl FileSystemService {
    pub fn current_id(&self) -> Option<&str> {
        self.workspace
            .as_ref()
            .map(|workspace| workspace.id.as_str())
    }
    pub fn open(&mut self, path: &Path) -> Result<Workspace> {
        check_chain(path)?;
        let root = fs::canonicalize(path)?;
        if !root.is_dir() {
            return Err(ServiceError::new("NOT_DIRECTORY", "Select a folder."));
        }
        self.generation += 1;
        let workspace = Workspace {
            id: self.generation.to_string(),
            name: path
                .file_name()
                .unwrap_or(path.as_os_str())
                .to_string_lossy()
                .into(),
            path: path.to_string_lossy().into(),
        };
        self.root = Some(root);
        self.workspace = Some(workspace.clone());
        Ok(workspace)
    }
    fn root(&self, id: &str) -> Result<&Path> {
        if self.workspace.as_ref().is_none_or(|w| w.id != id) {
            return Err(ServiceError::new(
                "STALE_WORKSPACE",
                "This workspace is no longer open.",
            ));
        }
        self.root
            .as_deref()
            .ok_or_else(|| ServiceError::new("NO_WORKSPACE", "Open a folder first."))
    }
    fn resolve(&self, id: &str, relative: &str, new: bool) -> Result<PathBuf> {
        validate_relative(relative)?;
        let root = self.root(id)?;
        let path = root.join(relative);
        let checked = if new {
            path.parent()
                .ok_or_else(|| ServiceError::new("INVALID_PATH", "Invalid parent."))?
        } else {
            &path
        };
        check_containment(root, checked)?;
        Ok(path)
    }
    fn non_root(&self, id: &str, relative: &str, new: bool) -> Result<PathBuf> {
        if relative.is_empty() {
            return Err(ServiceError::new(
                "PROTECTED_ROOT",
                "The workspace root cannot be modified.",
            ));
        }
        self.resolve(id, relative, new)
    }
    pub fn relative(&self, id: &str, absolute: &Path) -> Result<String> {
        check_chain(absolute)?;
        let canonical = fs::canonicalize(absolute)?;
        let relative = canonical.strip_prefix(self.root(id)?).map_err(|_| {
            ServiceError::new("INVALID_PATH", "Select a file inside the active workspace.")
        })?;
        Ok(relative.to_string_lossy().replace('\\', "/"))
    }
    pub fn root_path(&self, id: &str) -> Result<PathBuf> {
        Ok(self.root(id)?.to_path_buf())
    }
    pub fn list(&self, id: &str, relative: &str) -> Result<Vec<Entry>> {
        let path = self.resolve(id, relative, false)?;
        let mut result = Vec::new();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let meta = fs::symlink_metadata(entry.path())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let kind = if is_link(&meta) {
                "blocked"
            } else if meta.is_dir() {
                "directory"
            } else if meta.is_file() {
                "file"
            } else {
                "blocked"
            };
            result.push(Entry {
                path: if relative.is_empty() {
                    name.clone()
                } else {
                    format!("{relative}/{name}")
                },
                name,
                kind,
            });
        }
        result.sort_by_key(|e| (e.kind != "directory", e.name.to_lowercase(), e.name.clone()));
        Ok(result)
    }
    pub fn read(&self, id: &str, relative: &str) -> Result<Document> {
        let data = bytes(&self.non_root(id, relative, false)?)?;
        let bom = data.starts_with(&[0xef, 0xbb, 0xbf]);
        let text = if bom { &data[3..] } else { &data };
        if text.contains(&0) {
            return Err(ServiceError::new(
                "UNSUPPORTED_ENCODING",
                "Binary and UTF-16 files cannot be edited. Use UTF-8 text.",
            ));
        }
        let content = std::str::from_utf8(text)
            .map_err(|_| ServiceError::new("UNSUPPORTED_ENCODING", "This file is not UTF-8 text."))?
            .to_string();
        let without_crlf = content.replace("\r\n", "");
        if without_crlf.contains('\r') || (content.contains("\r\n") && without_crlf.contains('\n'))
        {
            return Err(ServiceError::new("UNSUPPORTED_LINE_ENDINGS", "This file has mixed or legacy line endings. Normalize it to LF or CRLF before editing in TBCE."));
        }
        Ok(Document {
            path: relative.into(),
            content,
            revision: revision(&data),
            bom,
        })
    }
    pub fn write(
        &self,
        id: &str,
        relative: &str,
        content: &str,
        expected: &str,
        bom: bool,
    ) -> Result<Document> {
        let path = self.non_root(id, relative, false)?;
        let current = bytes(&path)?;
        if revision(&current) != expected {
            return Err(ServiceError::new(
                "CONFLICT",
                "This file changed on disk. Reload it or explicitly overwrite the newer version.",
            ));
        }
        if content.len() as u64 + if bom { 3 } else { 0 } > MAX_FILE_SIZE {
            return Err(ServiceError::new(
                "TOO_LARGE",
                "Files larger than 10 MiB are not supported.",
            ));
        }
        let permissions = fs::metadata(&path)?.permissions();
        if permissions.readonly() {
            return Err(ServiceError::new(
                "PERMISSION_DENIED",
                "This file is read-only.",
            ));
        }
        let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
        if bom {
            temp.write_all(&[0xef, 0xbb, 0xbf])?;
        }
        temp.write_all(content.as_bytes())?;
        temp.as_file().set_permissions(permissions)?;
        temp.as_file().sync_all()?;
        self.non_root(id, relative, false)?;
        if revision(&bytes(&path)?) != expected {
            return Err(ServiceError::new(
                "CONFLICT",
                "This file changed while saving. Try again.",
            ));
        }
        temp.persist(&path)
            .map_err(|e| ServiceError::from(e.error))?;
        let mut saved = Vec::with_capacity(content.len() + 3);
        if bom {
            saved.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        }
        saved.extend_from_slice(content.as_bytes());
        Ok(Document {
            path: relative.into(),
            content: content.into(),
            revision: revision(&saved),
            bom,
        })
    }
    pub fn create(&self, id: &str, relative: &str, directory: bool) -> Result<()> {
        let path = self.non_root(id, relative, true)?;
        if directory {
            fs::create_dir(path)?;
        } else {
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)?;
        }
        Ok(())
    }
    pub fn rename(&self, id: &str, from: &str, to: &str) -> Result<()> {
        let source = self.non_root(id, from, false)?;
        let destination = self.non_root(id, to, true)?;
        if fs::symlink_metadata(&destination).is_ok() {
            return Err(ServiceError::new(
                "ALREADY_EXISTS",
                "A file or folder already has that name.",
            ));
        }
        fs::rename(source, destination)?;
        Ok(())
    }
    pub fn trash(&self, id: &str, relative: &str) -> Result<()> {
        let path = self.non_root(id, relative, false)?;
        trash::delete(path).map_err(|e| ServiceError::new("TRASH_FAILED", e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, FileSystemService, String) {
        let temp = tempfile::tempdir().unwrap();
        let mut service = FileSystemService::default();
        let id = service.open(temp.path()).unwrap().id;
        (temp, service, id)
    }
    #[test]
    fn round_trip_preserves_bom_unicode_and_crlf() {
        let (temp, service, id) = setup();
        fs::write(temp.path().join("Türkçe file.ts"), b"\xef\xbb\xbfhello\r\n").unwrap();
        let doc = service.read(&id, "Türkçe file.ts").unwrap();
        service
            .write(&id, &doc.path, "merhaba\r\n", &doc.revision, doc.bom)
            .unwrap();
        assert_eq!(
            fs::read(temp.path().join(&doc.path)).unwrap(),
            b"\xef\xbb\xbfmerhaba\r\n"
        );
    }
    #[test]
    fn rejects_traversal_and_root_mutation() {
        let (_temp, service, id) = setup();
        for path in [
            "../escape",
            "/absolute",
            "C:/outside",
            "a/../b",
            "a\\b",
            "file:stream",
            "NUL",
            "a.",
        ] {
            assert!(service.create(&id, path, false).is_err(), "{path}");
        }
        assert_eq!(service.trash(&id, "").unwrap_err().code, "PROTECTED_ROOT");
    }
    #[test]
    fn rejects_conflict_without_overwriting() {
        let (temp, service, id) = setup();
        service.create(&id, "file", false).unwrap();
        let doc = service.read(&id, "file").unwrap();
        fs::write(temp.path().join("file"), "external").unwrap();
        assert_eq!(
            service
                .write(&id, "file", "mine", &doc.revision, false)
                .err()
                .unwrap()
                .code,
            "CONFLICT"
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("file")).unwrap(),
            "external"
        );
    }
    #[test]
    fn creates_lists_renames_and_rejects_collisions() {
        let (_temp, service, id) = setup();
        service.create(&id, "z-folder", true).unwrap();
        service.create(&id, "a", false).unwrap();
        service.create(&id, ".hidden", false).unwrap();
        assert_eq!(service.list(&id, "").unwrap()[0].name, "z-folder");
        assert!(service.create(&id, "a", false).is_err());
        assert!(service.rename(&id, "a", ".hidden").is_err());
        service.rename(&id, "a", "z-folder/b").unwrap();
        assert_eq!(service.list(&id, "z-folder").unwrap()[0].path, "z-folder/b");
    }
    #[test]
    fn rejects_binary_invalid_utf8_and_large_files() {
        let (temp, service, id) = setup();
        for data in [
            vec![0, 1],
            vec![255],
            vec![b'x'; MAX_FILE_SIZE as usize + 1],
        ] {
            fs::write(temp.path().join("file"), data).unwrap();
            assert!(service.read(&id, "file").is_err());
        }
    }
    #[test]
    fn failed_save_preserves_file() {
        let (temp, service, id) = setup();
        fs::write(temp.path().join("file"), "original").unwrap();
        let doc = service.read(&id, "file").unwrap();
        let mut permissions = fs::metadata(temp.path().join("file"))
            .unwrap()
            .permissions();
        permissions.set_readonly(true);
        fs::set_permissions(temp.path().join("file"), permissions).unwrap();
        assert!(service
            .write(&id, "file", "new", &doc.revision, false)
            .is_err());
        assert_eq!(
            fs::read_to_string(temp.path().join("file")).unwrap(),
            "original"
        );
    }
    #[test]
    fn invalidates_old_workspace() {
        let (temp, mut service, id) = setup();
        service.open(temp.path()).unwrap();
        assert!(service.list(&id, "").is_err());
    }
    #[test]
    fn rejects_line_endings_monaco_would_silently_normalize() {
        let (temp, service, id) = setup();
        for content in ["a\r\nb\n", "a\rb\r"] {
            fs::write(temp.path().join("mixed"), content).unwrap();
            assert_eq!(
                service.read(&id, "mixed").err().unwrap().code,
                "UNSUPPORTED_LINE_ENDINGS"
            );
        }
    }
    #[cfg(windows)]
    #[test]
    fn rejects_junctions() {
        use std::os::windows::process::CommandExt;
        let (temp, service, id) = setup();
        let outside = tempfile::tempdir().unwrap();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(temp.path().join("link"))
            .arg(outside.path())
            .creation_flags(0x08000000)
            .output()
            .unwrap();
        assert!(status.status.success());
        assert_eq!(
            service.list(&id, "link").err().unwrap().code,
            "LINK_NOT_ALLOWED"
        );
        assert!(service.create(&id, "link/escape", false).is_err());
    }
    #[test]
    fn accepts_turkish_names_without_locale_dependent_case_folding() {
        // Turkish case folding maps `i` to `İ` and `I` to `ı`. The reserved-name check folds ASCII
        // only, so neither mapping can turn an ordinary name into a device name or hide one.
        for name in ["ışık.txt", "Iğdır", "İstanbul.ts", "çğöşü.md", "CONağ.txt"] {
            assert!(valid_name(name), "{name}");
        }
        for name in ["con", "CON.txt", "NUL", "lpt1.log"] {
            assert!(!valid_name(name), "{name}");
        }
    }
}
