use crate::filesystem::{metadata_path, valid_name, Result, ServiceError};
use crate::templates::SourceEntry;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StarterFile {
    pub path: String,
    pub content: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchitectureFields {
    pub name: String,
    pub description: String,
    pub boundaries: String,
    pub directories: Vec<String>,
    pub files: Vec<StarterFile>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Architecture {
    pub schema_version: u32,
    pub id: String,
    #[serde(flatten)]
    pub fields: ArchitectureFields,
}
#[derive(Serialize)]
pub struct Catalog {
    pub architectures: Vec<Architecture>,
    pub warnings: Vec<String>,
}
#[derive(Clone, Serialize)]
pub struct StructureEntry {
    pub path: String,
    pub directory: bool,
}
#[derive(Serialize)]
pub struct Preview {
    pub entries: Vec<StructureEntry>,
    pub conflicts: Vec<String>,
}
pub struct ArchitectureService {
    root: PathBuf,
}
fn invalid(message: impl Into<String>) -> ServiceError {
    ServiceError::new("INVALID_ARCHITECTURE", message)
}
fn token(id: &str) -> Result<()> {
    if !id.starts_with("architecture-")
        || id.len() > 100
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(invalid("Invalid architecture identifier."));
    }
    Ok(())
}
fn validate_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.contains('\\')
        || path.split('/').any(|p| {
            !valid_name(p) || p.eq_ignore_ascii_case(".git") || p.eq_ignore_ascii_case(".tbce")
        })
    {
        return Err(invalid(format!("Invalid architecture path: {path}. Use relative paths separated by /; Git and TBCE metadata are reserved.")));
    }
    Ok(())
}

// Include implicit parents so a file can never mask another entry's directory.
fn insert(
    entries: &mut BTreeMap<String, StructureEntry>,
    conflicts: &mut Vec<String>,
    path: &str,
    directory: bool,
) {
    if let Some((parent, _)) = path.rsplit_once('/') {
        insert(entries, conflicts, parent, true);
    }
    let key = path.to_lowercase();
    if let Some(previous) = entries.get(&key) {
        if !directory || !previous.directory || previous.path != path {
            conflicts.push(format!("{} ↔ {path}", previous.path));
        }
    } else {
        entries.insert(
            key,
            StructureEntry {
                path: path.into(),
                directory,
            },
        );
    }
}

pub fn preview(stack: &[SourceEntry], architecture: Option<&Architecture>) -> Result<Preview> {
    let mut entries = BTreeMap::new();
    let mut conflicts = vec![];
    for entry in stack {
        validate_path(&entry.path)?;
        insert(&mut entries, &mut conflicts, &entry.path, entry.directory);
    }
    if let Some(architecture) = architecture {
        for path in &architecture.fields.directories {
            validate_path(path)?;
            insert(&mut entries, &mut conflicts, path, true);
        }
        for file in &architecture.fields.files {
            validate_path(&file.path)?;
            insert(&mut entries, &mut conflicts, &file.path, false);
        }
    }
    conflicts.sort();
    conflicts.dedup();
    Ok(Preview {
        entries: entries.into_values().collect(),
        conflicts,
    })
}
fn normalize(mut fields: ArchitectureFields) -> Result<ArchitectureFields> {
    fields.name = fields.name.trim().into();
    if fields.name.is_empty() {
        return Err(invalid("Enter an architecture name."));
    }
    fields.description = fields.description.trim().into();
    fields.boundaries = fields.boundaries.trim().into();
    let test = Architecture {
        schema_version: 1,
        id: String::new(),
        fields: fields.clone(),
    };
    let result = preview(&[], Some(&test))?;
    if !result.conflicts.is_empty() {
        return Err(invalid(format!(
            "Conflicting paths: {}",
            result.conflicts.join(", ")
        )));
    }
    if fields
        .files
        .iter()
        .any(|f| f.content.contains('\0') || f.content.len() > 10 * 1024 * 1024)
    {
        return Err(invalid(
            "Starter files must be text without NUL characters, up to 10 MiB each.",
        ));
    }
    Ok(fields)
}
impl ArchitectureService {
    pub fn new(root: PathBuf) -> Result<Self> {
        let mut ancestor = root.as_path();
        while !ancestor.try_exists()? {
            ancestor = ancestor
                .parent()
                .ok_or_else(|| invalid("Invalid architecture library path."))?;
        }
        metadata_path(ancestor, "")?;
        fs::create_dir_all(&root)?;
        metadata_path(&root, "")?;
        Ok(Self { root })
    }
    fn definition(&self, id: &str) -> Result<PathBuf> {
        token(id)?;
        metadata_path(&self.root, &format!("{id}/architecture.json"))
    }
    pub fn get(&self, id: &str) -> Result<Architecture> {
        let mut value: Architecture = serde_json::from_slice(&fs::read(self.definition(id)?)?)
            .map_err(|e| invalid(e.to_string()))?;
        if value.schema_version != 1 || value.id != id {
            return Err(invalid(
                "Unsupported or mismatched architecture definition.",
            ));
        }
        value.fields = normalize(value.fields)?;
        Ok(value)
    }
    pub fn list(&self) -> Result<Catalog> {
        let mut catalog = Catalog {
            architectures: vec![],
            warnings: vec![],
        };
        for entry in fs::read_dir(&self.root)? {
            let id = entry?.file_name().to_string_lossy().to_string();
            if !id.starts_with("architecture-") {
                continue;
            }
            match self.get(&id) {
                Ok(value) => catalog.architectures.push(value),
                Err(error) => catalog
                    .warnings
                    .push(format!("Skipped {id}: {}", error.message)),
            }
        }
        catalog
            .architectures
            .sort_by_key(|a| (a.fields.name.to_lowercase(), a.id.clone()));
        Ok(catalog)
    }
    pub fn save(&self, id: Option<&str>, fields: ArchitectureFields) -> Result<Architecture> {
        let fields = normalize(fields)?;
        if let Some(id) = id {
            self.get(id)?;
        }
        let new_dir = if id.is_none() {
            Some(
                tempfile::Builder::new()
                    .prefix("architecture-")
                    .tempdir_in(&self.root)?,
            )
        } else {
            None
        };
        let id = id.map(String::from).unwrap_or_else(|| {
            new_dir
                .as_ref()
                .unwrap()
                .path()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned()
        });
        let value = Architecture {
            schema_version: 1,
            id,
            fields,
        };
        let path = self.definition(&value.id)?;
        let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
        file.write_all(&serde_json::to_vec_pretty(&value).map_err(|e| invalid(e.to_string()))?)?;
        file.as_file().sync_all()?;
        file.persist(path)
            .map_err(|e| ServiceError::from(e.error))?;
        if let Some(dir) = new_dir {
            let _ = dir.keep();
        }
        Ok(value)
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        token(id)?;
        trash::delete(metadata_path(&self.root, id)?)
            .map_err(|e| ServiceError::new("TRASH_FAILED", e.to_string()))
    }
    pub fn apply(architecture: &Architecture, root: &Path) -> Result<()> {
        normalize(architecture.fields.clone())?;
        for entry in preview(&[], Some(architecture))?
            .entries
            .iter()
            .filter(|e| e.directory)
        {
            fs::create_dir_all(metadata_path(root, &entry.path)?)?;
        }
        for file in &architecture.fields.files {
            let mut target = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(metadata_path(root, &file.path)?)?;
            target.write_all(file.content.as_bytes())?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{ProjectDetection, ProjectFields, ProjectService};
    use crate::templates::{StackFields, TemplateService};

    fn fields() -> ArchitectureFields {
        ArchitectureFields {
            name: " My layers ".into(),
            description: "Description".into(),
            boundaries: "Domain has no infrastructure dependencies.".into(),
            directories: vec!["src/domain".into(), "empty".into()],
            files: vec![StarterFile {
                path: "src/domain/README.md".into(),
                content: "# Türkçe\r\nŞablon\n".into(),
            }],
        }
    }
    fn project() -> ProjectFields {
        ProjectFields {
            name: "Example".into(),
            stack: None,
            architecture: None,
            default_branch: None,
            commands: Default::default(),
        }
    }
    #[test]
    fn catalog_survives_restart_and_edit_keeps_id() {
        let root = tempfile::tempdir().unwrap();
        let service = ArchitectureService::new(root.path().into()).unwrap();
        assert!(service.list().unwrap().architectures.is_empty());
        let saved = service.save(None, fields()).unwrap();
        assert_eq!(saved.fields.name, "My layers");
        let service = ArchitectureService::new(root.path().into()).unwrap();
        assert_eq!(service.list().unwrap().architectures.len(), 1);
        let mut edited = fields();
        edited.name = "New name".into();
        let updated = service.save(Some(&saved.id), edited).unwrap();
        assert_eq!(updated.id, saved.id);
        let mut invalid = fields();
        invalid.files[0].path = "../outside".into();
        assert!(service.save(Some(&saved.id), invalid).is_err());
        assert_eq!(service.get(&saved.id).unwrap().fields.name, "New name");
    }
    #[test]
    fn corrupt_future_and_mismatched_definitions_are_warned_and_skipped() {
        let root = tempfile::tempdir().unwrap();
        let service = ArchitectureService::new(root.path().into()).unwrap();
        let mut saved = service.save(None, fields()).unwrap();
        let path = service.definition(&saved.id).unwrap();
        fs::write(&path, "not json").unwrap();
        assert_eq!(service.list().unwrap().warnings.len(), 1);
        saved.schema_version = 2;
        fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();
        assert!(service.list().unwrap().architectures.is_empty());
        saved.schema_version = 1;
        saved.id = "architecture-wrong".into();
        fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();
        assert_eq!(service.list().unwrap().warnings.len(), 1);
    }
    #[test]
    fn rejects_unsafe_paths_duplicate_files_and_case_collisions() {
        for path in [
            "",
            "../x",
            "/root",
            "C:/x",
            "a\\b",
            "a//b",
            "NUL.txt",
            "a:stream",
            "a/COM1",
            ".git/config",
            "a/.TBCE/x",
            "a/../b",
            "a./b",
        ] {
            let mut value = fields();
            value.files[0].path = path.into();
            assert!(normalize(value).is_err(), "{path}");
        }
        let mut value = fields();
        value.files.push(value.files[0].clone());
        assert!(normalize(value).is_err());
        let mut value = fields();
        value.directories.push("SRC/domain".into());
        assert!(normalize(value).is_err());
        let mut value = fields();
        value.files[0].path = "src".into();
        assert!(normalize(value).is_err());
    }
    #[test]
    fn generates_empty_folders_text_and_fresh_metadata_independently() {
        let root = tempfile::tempdir().unwrap();
        let architectures = ArchitectureService::new(root.path().join("architectures")).unwrap();
        let templates = TemplateService::new(root.path().join("stacks")).unwrap();
        let saved = architectures.save(None, fields()).unwrap();
        let created = templates
            .create_with_architecture(root.path(), project(), None, Some(&saved))
            .unwrap();
        assert!(created.join("empty").is_dir());
        assert_eq!(
            fs::read_to_string(created.join("src/domain/README.md")).unwrap(),
            fields().files[0].content
        );
        match ProjectService::detect(&created).unwrap() {
            ProjectDetection::Found { manifest, .. } => {
                assert_eq!(manifest.architecture.as_deref(), Some(saved.id.as_str()));
                assert!(manifest.stack.is_none());
                assert_eq!(manifest.schema_version, 1);
            }
            _ => panic!("missing project"),
        }
        architectures.delete(&saved.id).unwrap();
        assert!(architectures.list().unwrap().architectures.is_empty());
        assert!(created.join("src/domain/README.md").is_file());
        assert!(templates
            .create_with_architecture(root.path(), project(), None, Some(&saved))
            .is_err());
    }
    #[test]
    fn merged_preview_and_creation_agree_and_conflicts_leave_no_destination() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        fs::create_dir_all(source.join("src/domain")).unwrap();
        fs::write(source.join("src/domain/README.md"), "stack file").unwrap();
        let templates = TemplateService::new(root.path().join("stacks")).unwrap();
        let entries = TemplateService::inspect(&source, "src/domain").unwrap();
        let stack = templates
            .save(
                &source,
                None,
                StackFields {
                    name: "Stack".into(),
                    description: "".into(),
                    languages: vec![],
                    frameworks: vec![],
                    defaults: project(),
                },
                entries,
            )
            .unwrap();
        let architecture = Architecture {
            schema_version: 1,
            id: "architecture-test".into(),
            fields: fields(),
        };
        let plan = preview(&stack.entries, Some(&architecture)).unwrap();
        assert!(!plan.conflicts.is_empty());
        let error = templates
            .create_with_architecture(root.path(), project(), Some(&stack.id), Some(&architecture))
            .err()
            .unwrap();
        assert_eq!(error.code, "STRUCTURE_CONFLICT");
        assert!(!root.path().join("Example").exists());
        assert_eq!(
            fs::read_to_string(source.join("src/domain/README.md")).unwrap(),
            "stack file"
        );
        let mut architecture = architecture;
        architecture.fields.files[0].path = "src/domain/notes.md".into();
        assert!(preview(&stack.entries, Some(&architecture))
            .unwrap()
            .conflicts
            .is_empty());
        let created = templates
            .create_with_architecture(root.path(), project(), Some(&stack.id), Some(&architecture))
            .unwrap();
        assert!(created.join("src/domain/README.md").is_file());
        assert!(created.join("src/domain/notes.md").is_file());
    }
    #[test]
    fn detects_file_directory_and_case_conflicts_in_stack_combination() {
        let mut architecture = Architecture {
            schema_version: 1,
            id: "architecture-test".into(),
            fields: fields(),
        };
        for (path, directory) in [
            ("src", false),
            ("src/domain/README.md", true),
            ("SRC", true),
        ] {
            let entry = SourceEntry {
                path: path.into(),
                directory,
                size: 0,
                revision: String::new(),
                selected: true,
                blocked: None,
            };
            assert!(!preview(&[entry], Some(&architecture))
                .unwrap()
                .conflicts
                .is_empty());
        }
        architecture.fields.files[0].content = "\0".into();
        assert!(normalize(architecture.fields).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn rejects_junctions_in_library_and_generation_paths() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let service = ArchitectureService::new(root.path().join("library")).unwrap();
        let link = service.root.join("architecture-linked");
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(status.status.success());
        assert!(service.get("architecture-linked").is_err());
        assert!(service.delete("architecture-linked").is_err());
        let target = root.path().join("target");
        fs::create_dir(&target).unwrap();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(target.join("src"))
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(status.status.success());
        let architecture = Architecture {
            schema_version: 1,
            id: "architecture-test".into(),
            fields: fields(),
        };
        assert!(ArchitectureService::apply(&architecture, &target).is_err());
        assert!(!outside.path().join("domain").exists());
        fs::remove_dir(target.join("src")).unwrap();
        fs::remove_dir(link).unwrap();
    }
}
