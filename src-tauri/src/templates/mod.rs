use crate::filesystem::{metadata_path, valid_name, Result, ServiceError};
use crate::project::{ProjectFields, ProjectService};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackFields {
    pub name: String,
    pub description: String,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
    pub defaults: ProjectFields,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{ProjectCommands, ProjectDetection};

    fn fields(name: &str) -> ProjectFields {
        ProjectFields {
            name: name.into(),
            stack: None,
            architecture: Some("layered".into()),
            default_branch: Some("main".into()),
            commands: ProjectCommands {
                dev: Some("npm run dev".into()),
                ..Default::default()
            },
        }
    }
    fn details() -> StackFields {
        StackFields {
            name: "My starter".into(),
            description: "Reusable files".into(),
            languages: vec!["typescript".into()],
            frameworks: vec![],
            defaults: fields("Original"),
        }
    }
    fn selected(root: &Path, path: &str) -> Vec<SourceEntry> {
        let mut result = vec![];
        for entry in TemplateService::inspect(root, path)
            .unwrap()
            .into_iter()
            .filter(|e| e.selected)
        {
            if entry.directory {
                result.extend(selected(root, &entry.path));
            }
            result.push(entry);
        }
        result
    }
    #[test]
    fn library_starts_empty_and_snapshot_survives_source_removal_and_restart() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        let parent = tempfile::tempdir().unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        assert!(service.list().unwrap().stacks.is_empty());
        fs::create_dir_all(source.path().join("src/empty")).unwrap();
        fs::write(
            source.path().join("src/çalışma.ts"),
            b"\xef\xbb\xbfconst original = 1;\r\n",
        )
        .unwrap();
        fs::write(source.path().join("asset.bin"), [0, 255, 128, 2]).unwrap();
        let stack = service
            .save(source.path(), None, details(), selected(source.path(), ""))
            .unwrap();
        drop(source);
        let service = TemplateService::new(library.path().into()).unwrap();
        assert_eq!(service.list().unwrap().stacks.len(), 1);
        let destination = service
            .create(parent.path(), fields("Türkçe project"), Some(&stack.id))
            .unwrap();
        assert_eq!(
            fs::read(destination.join("src/çalışma.ts")).unwrap(),
            b"\xef\xbb\xbfconst original = 1;\r\n"
        );
        assert_eq!(
            fs::read(destination.join("asset.bin")).unwrap(),
            [0, 255, 128, 2]
        );
        assert!(destination.join("src/empty").is_dir());
        match ProjectService::detect(&destination).unwrap() {
            ProjectDetection::Found { manifest, .. } => {
                assert_eq!(manifest.name, "Türkçe project");
                assert_eq!(manifest.stack.as_deref(), Some(stack.id.as_str()));
                assert_eq!(manifest.commands.dev.as_deref(), Some("npm run dev"));
            }
            _ => panic!("Expected project"),
        }
    }
    #[test]
    fn defaults_omit_metadata_and_deselect_dependencies_and_environment_files() {
        let source = tempfile::tempdir().unwrap();
        for name in [
            ".git",
            ".tbce",
            "node_modules",
            "target",
            "dist",
            ".venv",
            ".cache",
        ] {
            fs::create_dir(source.path().join(name)).unwrap();
        }
        for name in [
            ".env",
            ".env.local",
            ".env.example",
            "package-lock.json",
            ".gitignore",
        ] {
            fs::write(source.path().join(name), b"example").unwrap();
        }
        let entries = TemplateService::inspect(source.path(), "").unwrap();
        assert!(!entries
            .iter()
            .any(|e| e.path == ".git" || e.path == ".tbce"));
        for entry in entries {
            assert_eq!(
                entry.selected,
                [".env.example", "package-lock.json", ".gitignore"].contains(&entry.path.as_str()),
                "{}",
                entry.path
            );
        }
    }
    #[test]
    fn explicit_selection_can_include_an_environment_file() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        fs::write(source.path().join(".env"), b"EXAMPLE=1").unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        let entries = TemplateService::inspect(source.path(), "").unwrap();
        let stack = service
            .save(source.path(), None, details(), entries)
            .unwrap();
        assert_eq!(stack.entries[0].path, ".env");
    }
    #[test]
    fn failed_replacement_retains_the_published_snapshot() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        fs::write(source.path().join("index.ts"), b"old").unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        let entries = selected(source.path(), "");
        let old = service
            .save(source.path(), None, details(), entries.clone())
            .unwrap();
        fs::write(source.path().join("index.ts"), b"new").unwrap();
        assert_eq!(
            service
                .save(source.path(), Some(&old.id), details(), entries)
                .err()
                .unwrap()
                .code,
            "SOURCE_CHANGED"
        );
        assert_eq!(service.get(&old.id).unwrap().snapshot, old.snapshot);
        assert_eq!(
            fs::read(
                library
                    .path()
                    .join(&old.id)
                    .join(&old.snapshot)
                    .join("files/index.ts")
            )
            .unwrap(),
            b"old"
        );
        let new = service
            .save(
                source.path(),
                Some(&old.id),
                details(),
                selected(source.path(), ""),
            )
            .unwrap();
        assert_eq!(new.id, old.id);
        assert_ne!(new.snapshot, old.snapshot);
        assert_eq!(service.list().unwrap().stacks.len(), 1);
    }
    #[test]
    fn editing_details_does_not_change_snapshot_or_generated_project() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        let parent = tempfile::tempdir().unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        let old = service
            .save(source.path(), None, details(), vec![])
            .unwrap();
        let generated = service
            .create(parent.path(), fields("Created"), Some(&old.id))
            .unwrap();
        let before = fs::read(generated.join(".tbce/project.json")).unwrap();
        let mut changed = details();
        changed.name = "Renamed".into();
        let edited = service.edit(&old.id, changed).unwrap();
        assert_eq!(edited.snapshot, old.snapshot);
        assert_eq!(service.get(&old.id).unwrap().fields.name, "Renamed");
        service.delete(&old.id).unwrap();
        assert!(service.list().unwrap().stacks.is_empty());
        assert_eq!(
            fs::read(generated.join(".tbce/project.json")).unwrap(),
            before
        );
    }
    #[test]
    fn collisions_invalid_names_and_missing_stacks_leave_destinations_untouched() {
        let library = tempfile::tempdir().unwrap();
        let parent = tempfile::tempdir().unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        fs::create_dir(parent.path().join("exists")).unwrap();
        fs::write(parent.path().join("exists/sentinel"), b"untouched").unwrap();
        assert_eq!(
            service
                .create(parent.path(), fields("exists"), None)
                .err()
                .unwrap()
                .code,
            "ALREADY_EXISTS"
        );
        for name in ["../escape", "CON", "a/b", "bad.", ""] {
            assert!(service.create(parent.path(), fields(name), None).is_err());
        }
        assert!(service
            .create(parent.path(), fields("missing"), Some("stack-missing"))
            .is_err());
        assert!(!parent.path().join("missing").exists());
        assert_eq!(
            fs::read(parent.path().join("exists/sentinel")).unwrap(),
            b"untouched"
        );
        assert_eq!(fs::read_dir(parent.path()).unwrap().count(), 1);
    }
    #[test]
    fn rejects_traversal_metadata_and_duplicate_selections_without_publishing() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        for path in [
            "../outside",
            "C:/outside",
            "file:stream",
            ".git/config",
            ".tbce/project.json",
            "CON",
        ] {
            let entry = SourceEntry {
                path: path.into(),
                directory: true,
                size: 0,
                revision: String::new(),
                selected: true,
                blocked: None,
            };
            assert!(
                service
                    .save(source.path(), None, details(), vec![entry])
                    .is_err(),
                "{path}"
            );
        }
        fs::write(source.path().join("file"), b"test").unwrap();
        let mut entries = selected(source.path(), "");
        entries.push(entries[0].clone());
        assert!(service
            .save(source.path(), None, details(), entries)
            .is_err());
        assert!(service.list().unwrap().stacks.is_empty());
    }
    #[test]
    fn corrupt_and_future_catalog_entries_are_skipped() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        let good = service
            .save(source.path(), None, details(), vec![])
            .unwrap();
        for (id, data) in [
            ("stack-corrupt", "not json".to_string()),
            (
                "stack-future",
                serde_json::to_string(&Stack {
                    id: "stack-future".into(),
                    schema_version: 2,
                    ..good.clone()
                })
                .unwrap(),
            ),
        ] {
            fs::create_dir(library.path().join(id)).unwrap();
            fs::write(library.path().join(id).join("stack.json"), data).unwrap();
        }
        let catalog = service.list().unwrap();
        assert_eq!(catalog.stacks.len(), 1);
        assert_eq!(catalog.warnings.len(), 2);
    }
    #[test]
    fn corrupt_snapshot_fails_before_destination_is_created() {
        let source = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        let parent = tempfile::tempdir().unwrap();
        fs::write(source.path().join("file"), b"old").unwrap();
        let service = TemplateService::new(library.path().into()).unwrap();
        let stack = service
            .save(source.path(), None, details(), selected(source.path(), ""))
            .unwrap();
        fs::write(
            library
                .path()
                .join(&stack.id)
                .join(&stack.snapshot)
                .join("files/file"),
            b"bad",
        )
        .unwrap();
        assert!(service
            .create(parent.path(), fields("New"), Some(&stack.id))
            .is_err());
        assert_eq!(fs::read_dir(parent.path()).unwrap().count(), 0);
    }
    #[cfg(windows)]
    #[test]
    fn junctions_are_blocked_in_sources_and_library_paths() {
        use std::os::windows::process::CommandExt;
        let source = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("sentinel"), b"untouched").unwrap();
        let link = source.path().join("linked");
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .creation_flags(0x08000000)
            .output()
            .unwrap();
        assert!(output.status.success());
        let entries = TemplateService::inspect(source.path(), "").unwrap();
        assert!(entries[0].blocked.is_some());
        assert!(!entries[0].selected);
        let service = TemplateService::new(library.path().into()).unwrap();
        let malicious = SourceEntry {
            path: "linked/sentinel".into(),
            directory: false,
            size: 9,
            revision: hash(&outside.path().join("sentinel")).unwrap(),
            selected: true,
            blocked: None,
        };
        assert_eq!(
            service
                .save(source.path(), None, details(), vec![malicious])
                .err()
                .unwrap()
                .code,
            "LINK_NOT_ALLOWED"
        );
        assert!(TemplateService::new(link.join("new-library")).is_err());
        assert!(!outside.path().join("new-library").exists());
        assert_eq!(
            fs::read(outside.path().join("sentinel")).unwrap(),
            b"untouched"
        );
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stack {
    pub schema_version: u32,
    pub id: String,
    pub snapshot: String,
    #[serde(flatten)]
    pub fields: StackFields,
    pub entries: Vec<SourceEntry>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceEntry {
    pub path: String,
    pub directory: bool,
    pub size: u64,
    pub revision: String,
    pub selected: bool,
    pub blocked: Option<String>,
}

#[derive(Serialize)]
pub struct Catalog {
    pub stacks: Vec<Stack>,
    pub warnings: Vec<String>,
}

pub struct TemplateService {
    root: PathBuf,
}

fn invalid(message: impl Into<String>) -> ServiceError {
    ServiceError::new("INVALID_STACK", message)
}
fn omitted(path: &str) -> bool {
    path.split('/')
        .any(|part| part.eq_ignore_ascii_case(".git") || part.eq_ignore_ascii_case(".tbce"))
}
fn default_selected(path: &str) -> bool {
    !path.split('/').any(|part| {
        let name = part.to_ascii_lowercase();
        [
            "node_modules",
            "target",
            "dist",
            "build",
            "coverage",
            ".next",
            ".nuxt",
            ".cache",
            ".venv",
            "venv",
            "__pycache__",
            ".pytest_cache",
            ".mypy_cache",
            ".turbo",
        ]
        .contains(&name.as_str())
            || ((name == ".env" || name.starts_with(".env.")) && name != ".env.example")
    })
}
fn token(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(invalid("Invalid stack identifier."));
    }
    Ok(())
}
fn relative(root: &Path, path: &str) -> Result<PathBuf> {
    if path.is_empty() || omitted(path) {
        return Err(invalid("Git history and TBCE metadata cannot be included."));
    }
    metadata_path(root, path)
}
fn hash(path: &Path) -> Result<String> {
    let mut source = fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0; 64 * 1024];
    loop {
        let count = source.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
fn normalize(mut fields: StackFields) -> Result<StackFields> {
    fields.name = fields.name.trim().to_string();
    if fields.name.is_empty() {
        return Err(invalid("Enter a stack name."));
    }
    fields.description = fields.description.trim().to_string();
    for values in [&mut fields.languages, &mut fields.frameworks] {
        *values = values
            .iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        values.sort();
        values.dedup();
    }
    fields.defaults.stack = None;
    Ok(fields)
}

impl TemplateService {
    pub fn new(root: PathBuf) -> Result<Self> {
        let mut ancestor = root.as_path();
        while !ancestor.try_exists()? {
            ancestor = ancestor
                .parent()
                .ok_or_else(|| invalid("Invalid stack library path."))?;
        }
        metadata_path(ancestor, "")?;
        fs::create_dir_all(&root)?;
        // Validate the full chain, including app-data parents.
        metadata_path(&root, "")?;
        Ok(Self { root })
    }
    fn definition(&self, id: &str) -> Result<PathBuf> {
        token(id)?;
        metadata_path(&self.root, &format!("{id}/stack.json"))
    }
    pub fn get(&self, id: &str) -> Result<Stack> {
        let stack: Stack = serde_json::from_slice(&fs::read(self.definition(id)?)?)
            .map_err(|e| invalid(format!("Stack {id} could not be read: {e}")))?;
        if stack.schema_version != 1 || stack.id != id {
            return Err(invalid("Unsupported or mismatched stack definition."));
        }
        token(&stack.snapshot)?;
        normalize(stack.fields.clone())?;
        let root = metadata_path(&self.root, &format!("{id}/{}/files", stack.snapshot))?;
        if !root.is_dir() {
            return Err(invalid("Stack snapshot is missing."));
        }
        let mut seen = HashSet::new();
        for entry in &stack.entries {
            let path = relative(&root, &entry.path)?;
            let meta = fs::symlink_metadata(path)?;
            if (entry.directory && !meta.is_dir())
                || (!entry.directory && (!meta.is_file() || meta.len() != entry.size))
            {
                return Err(invalid(format!(
                    "Snapshot entry {} is missing or damaged.",
                    entry.path
                )));
            }
            if entry.blocked.is_some() || !seen.insert(entry.path.to_lowercase()) {
                return Err(invalid("Invalid snapshot entries."));
            }
        }
        Ok(stack)
    }
    pub fn list(&self) -> Result<Catalog> {
        let mut result = Catalog {
            stacks: vec![],
            warnings: vec![],
        };
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            let id = entry.file_name().to_string_lossy().to_string();
            if !id.starts_with("stack-") {
                continue;
            }
            match self.get(&id) {
                Ok(stack) => result.stacks.push(stack),
                Err(e) => result.warnings.push(format!("Skipped {id}: {} Restore its stack.json/snapshot from backup or remove the damaged stack folder in application data.", e.message)),
            }
        }
        result
            .stacks
            .sort_by_key(|s| (s.fields.name.to_lowercase(), s.id.clone()));
        Ok(result)
    }
    // Inspect one directory at a time: excluded dependency trees need not be crawled.
    pub fn inspect(root: &Path, directory: &str) -> Result<Vec<SourceEntry>> {
        let folder = metadata_path(root, directory)?;
        if omitted(directory) {
            return Err(invalid("This directory cannot be included."));
        }
        let mut entries = vec![];
        for entry in fs::read_dir(folder)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| invalid("A file name is not valid Unicode."))?;
            let path = if directory.is_empty() {
                name
            } else {
                format!("{directory}/{name}")
            };
            if omitted(&path) {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path())?;
            let blocked = relative(root, &path).err().map(|e| e.message).or_else(|| {
                if !meta.is_file() && !meta.is_dir() {
                    Some("Only regular files and directories can be saved.".into())
                } else {
                    None
                }
            });
            entries.push(SourceEntry {
                selected: blocked.is_none() && default_selected(&path),
                revision: if meta.is_file() && blocked.is_none() {
                    hash(&entry.path())?
                } else {
                    String::new()
                },
                path,
                directory: meta.is_dir(),
                size: if meta.is_file() { meta.len() } else { 0 },
                blocked,
            });
        }
        entries.sort_by_key(|e| (!e.directory, e.path.to_lowercase()));
        Ok(entries)
    }
    fn publish(&self, stack: &Stack) -> Result<()> {
        let path = self.definition(&stack.id)?;
        let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
        file.write_all(&serde_json::to_vec_pretty(stack).map_err(|e| invalid(e.to_string()))?)?;
        file.as_file().sync_all()?;
        file.persist(path)
            .map_err(|e| ServiceError::from(e.error))?;
        Ok(())
    }
    pub fn save(
        &self,
        root: &Path,
        id: Option<&str>,
        fields: StackFields,
        entries: Vec<SourceEntry>,
    ) -> Result<Stack> {
        let fields = normalize(fields)?;
        let existing = id.map(|id| self.get(id)).transpose()?;
        let new_dir = if existing.is_none() {
            Some(
                tempfile::Builder::new()
                    .prefix("stack-")
                    .tempdir_in(&self.root)?,
            )
        } else {
            None
        };
        let id = existing.as_ref().map(|s| s.id.clone()).unwrap_or_else(|| {
            new_dir
                .as_ref()
                .unwrap()
                .path()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string()
        });
        let folder = metadata_path(&self.root, &id)?;
        let snapshot = tempfile::Builder::new()
            .prefix("snapshot-")
            .tempdir_in(&folder)?;
        let files = snapshot.path().join("files");
        fs::create_dir(&files)?;
        Self::copy_entries(root, &files, &entries)?;
        let stack = Stack {
            schema_version: 1,
            id,
            snapshot: snapshot
                .path()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            fields,
            entries: entries
                .into_iter()
                .map(|e| SourceEntry {
                    selected: true,
                    ..e
                })
                .collect(),
        };
        self.publish(&stack)?;
        // Old generations remain as recovery data; only the published definition is active.
        let _ = snapshot.keep();
        if let Some(dir) = new_dir {
            let _ = dir.keep();
        }
        Ok(stack)
    }
    pub fn edit(&self, id: &str, fields: StackFields) -> Result<Stack> {
        let mut stack = self.get(id)?;
        stack.fields = normalize(fields)?;
        self.publish(&stack)?;
        Ok(stack)
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        token(id)?;
        let folder = metadata_path(&self.root, id)?;
        // Recycle Bin provides recovery for deliberate library deletion.
        trash::delete(folder).map_err(|e| ServiceError::new("TRASH_FAILED", e.to_string()))
    }
    fn copy_entries(source: &Path, target: &Path, entries: &[SourceEntry]) -> Result<()> {
        let mut seen = HashSet::new();
        let mut files = vec![];
        for entry in entries {
            if entry.blocked.is_some() || !seen.insert(entry.path.to_lowercase()) {
                return Err(invalid("Invalid or duplicate selection."));
            }
            let from = relative(source, &entry.path)?;
            let to = relative(target, &entry.path)?;
            let meta = fs::symlink_metadata(&from)?;
            if entry.directory {
                if !meta.is_dir() {
                    return Err(invalid(format!(
                        "{} is no longer a directory. Refresh the file list.",
                        entry.path
                    )));
                }
                fs::create_dir_all(to)?;
            } else {
                if !meta.is_file() || meta.len() != entry.size || hash(&from)? != entry.revision {
                    return Err(ServiceError::new(
                        "SOURCE_CHANGED",
                        format!(
                            "{} changed. Refresh the file list and try again.",
                            entry.path
                        ),
                    ));
                }
                fs::create_dir_all(to.parent().unwrap())?;
                let mut input = fs::File::open(&from)?;
                let mut output = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&to)?;
                std::io::copy(&mut input, &mut output)?;
                output.sync_all()?;
                if hash(&to)? != entry.revision {
                    return Err(ServiceError::new(
                        "SOURCE_CHANGED",
                        format!("{} changed while copying.", entry.path),
                    ));
                }
                files.push((from, entry));
            }
        }
        // Revalidate at completion to catch changes to files copied earlier.
        for (path, entry) in files {
            relative(source, &entry.path)?;
            if hash(&path)? != entry.revision {
                return Err(ServiceError::new(
                    "SOURCE_CHANGED",
                    format!("{} changed while copying.", entry.path),
                ));
            }
        }
        Ok(())
    }
    #[cfg(test)]
    pub fn create(
        &self,
        parent: &Path,
        fields: ProjectFields,
        stack_id: Option<&str>,
    ) -> Result<PathBuf> {
        self.create_with_architecture(parent, fields, stack_id, None)
    }
    pub fn create_with_architecture(
        &self,
        parent: &Path,
        fields: ProjectFields,
        stack_id: Option<&str>,
        architecture: Option<&crate::architecture::Architecture>,
    ) -> Result<PathBuf> {
        let name = fields.name.trim();
        if name.contains(['/', '\\']) || !valid_name(name) {
            return Err(ServiceError::new(
                "INVALID_NAME",
                "Enter a valid project folder name.",
            ));
        }
        let destination = metadata_path(parent, name)?;
        let stack = stack_id.map(|id| self.get(id)).transpose()?;
        let preview = crate::architecture::preview(
            stack.as_ref().map(|s| s.entries.as_slice()).unwrap_or(&[]),
            architecture,
        )?;
        if !preview.conflicts.is_empty() {
            return Err(ServiceError::new(
                "STRUCTURE_CONFLICT",
                format!("Conflicting paths: {}", preview.conflicts.join(", ")),
            ));
        }
        // Stage all work on the destination filesystem before reserving the final directory.
        let staging = tempfile::Builder::new()
            .prefix(".tbce-create-")
            .tempdir_in(parent)?;
        if let Some(stack) = &stack {
            let source = metadata_path(
                &self.root,
                &format!("{}/{}/files", stack.id, stack.snapshot),
            )?;
            Self::copy_entries(&source, staging.path(), &stack.entries)?;
        }
        if let Some(architecture) = architecture {
            crate::architecture::ArchitectureService::apply(architecture, staging.path())?;
        }
        let mut fields = fields;
        if let Some(architecture) = architecture {
            fields.architecture = Some(architecture.id.clone());
        }
        fields.stack = stack_id.map(String::from);
        ProjectService::init(staging.path(), fields)?;
        // create_dir is exclusive even on platforms where rename could replace an empty directory.
        fs::create_dir(&destination)?;
        let mut moved = vec![];
        let result = (|| -> Result<()> {
            for entry in fs::read_dir(staging.path())? {
                let entry = entry?;
                let to = metadata_path(
                    &destination,
                    entry
                        .file_name()
                        .to_str()
                        .ok_or_else(|| invalid("Invalid file name."))?,
                )?;
                if to.exists() {
                    return Err(ServiceError::new(
                        "ALREADY_EXISTS",
                        "The destination changed during creation.",
                    ));
                }
                fs::rename(entry.path(), &to)?;
                moved.push(to);
            }
            Ok(())
        })();
        if let Err(error) = result {
            // Move back only entries owned by this operation; never recursively delete the destination.
            let mut cleanup_failed = false;
            for path in moved {
                if fs::rename(&path, staging.path().join(path.file_name().unwrap())).is_err() {
                    cleanup_failed = true;
                }
            }
            if fs::remove_dir(&destination).is_err() {
                cleanup_failed = true;
            }
            if cleanup_failed {
                return Err(ServiceError::new(
                    "CLEANUP_FAILED",
                    format!(
                        "{} Incomplete project remains at {}.",
                        error.message,
                        destination.display()
                    ),
                ));
            }
            return Err(error);
        }
        Ok(destination)
    }
}
