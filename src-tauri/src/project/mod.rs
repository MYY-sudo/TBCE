use crate::filesystem::{metadata_path, Result, ServiceError};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommands {
    pub install: Option<String>,
    pub dev: Option<String>,
    pub build: Option<String>,
    pub test: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub name: String,
    pub stack: Option<String>,
    pub architecture: Option<String>,
    pub default_branch: Option<String>,
    #[serde(default)]
    pub commands: ProjectCommands,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFields {
    pub name: String,
    pub stack: Option<String>,
    pub architecture: Option<String>,
    pub default_branch: Option<String>,
    #[serde(default)]
    pub commands: ProjectCommands,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub manifest: ProjectManifest,
    pub path: String,
}
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ProjectDetection {
    None,
    Found {
        manifest: Box<ProjectManifest>,
        path: String,
    },
    Invalid {
        message: String,
    },
}

pub struct ProjectService;

fn manifest_path(root: &Path) -> Result<PathBuf> {
    metadata_path(root, ".tbce/project.json")
}
fn describe(root: &Path, manifest: ProjectManifest) -> Project {
    Project {
        manifest,
        // Canonical Windows roots carry a verbatim prefix that should never reach the interface.
        path: root
            .to_string_lossy()
            .trim_start_matches(r"\\?\")
            .to_string(),
    }
}

impl ProjectService {
    pub fn detect(root: &Path) -> Result<ProjectDetection> {
        let data = match fs::read(manifest_path(root)?) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(ProjectDetection::None)
            }
            Err(error) => return Err(error.into()),
        };
        Ok(match serde_json::from_slice::<ProjectManifest>(&data) {
            Ok(manifest) if manifest.schema_version == SCHEMA_VERSION => {
                let project = describe(root, manifest);
                ProjectDetection::Found {
                    manifest: Box::new(project.manifest),
                    path: project.path,
                }
            }
            Ok(manifest) => ProjectDetection::Invalid {
                message: format!(
                    "This project.json uses schema version {}. TBCE supports version {SCHEMA_VERSION}.",
                    manifest.schema_version
                ),
            },
            Err(error) => ProjectDetection::Invalid {
                message: format!("This project.json could not be read: {error}"),
            },
        })
    }
    pub fn init(root: &Path, fields: ProjectFields) -> Result<Project> {
        if manifest_path(root)?.exists() {
            return Err(ServiceError::new(
                "ALREADY_EXISTS",
                "This folder is already a TBCE project.",
            ));
        }
        Self::write(root, fields)
    }
    pub fn update(root: &Path, fields: ProjectFields) -> Result<Project> {
        if !manifest_path(root)?.exists() {
            return Err(ServiceError::new(
                "NOT_FOUND",
                "This folder is not a TBCE project yet. Convert it first.",
            ));
        }
        Self::write(root, fields)
    }
    fn write(root: &Path, fields: ProjectFields) -> Result<Project> {
        let name = fields.name.trim();
        if name.is_empty() {
            return Err(ServiceError::new("INVALID_NAME", "Enter a project name."));
        }
        let manifest = ProjectManifest {
            schema_version: SCHEMA_VERSION,
            name: name.into(),
            stack: fields.stack,
            architecture: fields.architecture,
            default_branch: fields.default_branch,
            commands: fields.commands,
        };
        let data = serde_json::to_vec_pretty(&manifest)
            .map_err(|error| ServiceError::new("INTERNAL", error.to_string()))?;
        let path = manifest_path(root)?;
        fs::create_dir_all(path.parent().unwrap())?;
        fs::write(manifest_path(root)?, data)?;
        Ok(describe(root, manifest))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fields(name: &str) -> ProjectFields {
        ProjectFields {
            name: name.into(),
            stack: Some("rust-tauri".into()),
            architecture: None,
            default_branch: Some("main".into()),
            commands: ProjectCommands {
                dev: Some("npm run dev".into()),
                ..ProjectCommands::default()
            },
        }
    }
    #[test]
    fn detects_nothing_in_a_plain_folder() {
        let temp = tempfile::tempdir().unwrap();
        assert!(matches!(
            ProjectService::detect(temp.path()).unwrap(),
            ProjectDetection::None
        ));
    }
    #[test]
    fn init_writes_a_manifest_that_detect_reads_back() {
        let temp = tempfile::tempdir().unwrap();
        let project = ProjectService::init(temp.path(), fields("Example")).unwrap();
        assert_eq!(project.manifest.name, "Example");
        match ProjectService::detect(temp.path()).unwrap() {
            ProjectDetection::Found { manifest, .. } => {
                assert_eq!(manifest.schema_version, SCHEMA_VERSION);
                assert_eq!(manifest.stack.as_deref(), Some("rust-tauri"));
                assert_eq!(manifest.commands.dev.as_deref(), Some("npm run dev"));
                assert!(manifest.commands.build.is_none());
            }
            _ => panic!("expected a detected project"),
        }
    }
    #[test]
    fn reports_unreadable_manifests_instead_of_failing() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".tbce")).unwrap();
        for data in [
            "not json".to_string(),
            format!(
                "{{\"schemaVersion\":{},\"name\":\"x\"}}",
                SCHEMA_VERSION + 1
            ),
        ] {
            fs::write(manifest_path(temp.path()).unwrap(), data).unwrap();
            assert!(matches!(
                ProjectService::detect(temp.path()).unwrap(),
                ProjectDetection::Invalid { .. }
            ));
        }
    }
    #[test]
    fn init_refuses_an_existing_project_and_update_refuses_a_missing_one() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(
            ProjectService::update(temp.path(), fields("Example"))
                .err()
                .unwrap()
                .code,
            "NOT_FOUND"
        );
        ProjectService::init(temp.path(), fields("Example")).unwrap();
        assert_eq!(
            ProjectService::init(temp.path(), fields("Example"))
                .err()
                .unwrap()
                .code,
            "ALREADY_EXISTS"
        );
    }
    #[test]
    fn update_replaces_every_field() {
        let temp = tempfile::tempdir().unwrap();
        ProjectService::init(temp.path(), fields("Example")).unwrap();
        let project = ProjectService::update(
            temp.path(),
            ProjectFields {
                name: "Renamed".into(),
                stack: None,
                architecture: Some("layered".into()),
                default_branch: None,
                commands: ProjectCommands::default(),
            },
        )
        .unwrap();
        assert_eq!(project.manifest.name, "Renamed");
        assert!(project.manifest.stack.is_none());
        assert_eq!(project.manifest.architecture.as_deref(), Some("layered"));
        assert!(project.manifest.commands.dev.is_none());
    }
    #[test]
    fn rejects_blank_names() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(
            ProjectService::init(temp.path(), fields("   "))
                .err()
                .unwrap()
                .code,
            "INVALID_NAME"
        );
    }
    #[test]
    fn project_detection_makes_no_claim_about_git() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".git")).unwrap();
        ProjectService::init(temp.path(), fields("Example")).unwrap();
        // Repository state belongs to GitService, which actually runs Git. A bare .git entry
        // proves nothing, so the project surface no longer reports one.
        let value = serde_json::to_value(ProjectService::detect(temp.path()).unwrap()).unwrap();
        assert_eq!(value["status"], "found");
        assert!(value.get("hasGit").is_none());
    }

    #[test]
    fn detection_keeps_the_existing_json_shape() {
        let temp = tempfile::tempdir().unwrap();
        ProjectService::init(temp.path(), fields("Example")).unwrap();
        let value = serde_json::to_value(ProjectService::detect(temp.path()).unwrap()).unwrap();
        assert_eq!(value["status"], "found");
        assert_eq!(value["manifest"]["name"], "Example");
        assert_eq!(value["manifest"]["schemaVersion"], SCHEMA_VERSION);
    }

    #[cfg(windows)]
    #[test]
    fn metadata_junctions_are_rejected_for_reads_and_writes() {
        use std::os::windows::process::CommandExt;
        for manifest_link in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let outside = tempfile::tempdir().unwrap();
            let sentinel = outside.path().join("project.json");
            fs::write(&sentinel, b"untouched").unwrap();
            let mut link = temp.path().join(".tbce");
            if manifest_link {
                fs::create_dir(temp.path().join(".tbce")).unwrap();
                link.push("project.json");
            }
            let output = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(link)
                .arg(outside.path())
                .creation_flags(0x08000000)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert_eq!(
                ProjectService::detect(temp.path()).err().unwrap().code,
                "LINK_NOT_ALLOWED"
            );
            assert_eq!(
                ProjectService::init(temp.path(), fields("New"))
                    .err()
                    .unwrap()
                    .code,
                "LINK_NOT_ALLOWED"
            );
            assert_eq!(
                ProjectService::update(temp.path(), fields("New"))
                    .err()
                    .unwrap()
                    .code,
                "LINK_NOT_ALLOWED"
            );
            assert_eq!(fs::read(&sentinel).unwrap(), b"untouched");
        }
    }

    #[cfg(unix)]
    #[test]
    fn manifest_symlinks_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let sentinel = outside.path().join("project.json");
        fs::write(&sentinel, b"untouched").unwrap();
        fs::create_dir(temp.path().join(".tbce")).unwrap();
        std::os::unix::fs::symlink(&sentinel, temp.path().join(".tbce/project.json")).unwrap();
        assert_eq!(
            ProjectService::detect(temp.path()).err().unwrap().code,
            "LINK_NOT_ALLOWED"
        );
        assert_eq!(
            ProjectService::update(temp.path(), fields("New"))
                .err()
                .unwrap()
                .code,
            "LINK_NOT_ALLOWED"
        );
        assert_eq!(fs::read(&sentinel).unwrap(), b"untouched");
    }
}
