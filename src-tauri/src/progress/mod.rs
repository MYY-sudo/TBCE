//! Project progress: areas of work, each with explicit tasks and optionally a GitHub label or
//! milestone whose issues belong to it. The plan lives in `.tbce/progress.json` beside the manifest
//! rather than inside it, so the manifest keeps schema version 1 and a settings save, which rewrites
//! the manifest from the fields it knows, cannot erase it. Nothing here reads commits.

use crate::filesystem::{metadata_path, revision, Result, ServiceError};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const SCHEMA_VERSION: u32 = 1;
const AREAS_MAX: usize = 50;
const TASKS_MAX: usize = 200;
const NAME_MAX: usize = 100;
const TITLE_MAX: usize = 200;
/// GitHub's own limit for a label name.
const LABEL_MAX: usize = 50;
const ID_MAX: usize = 64;
/// Far above what the limits above can produce, so only a file that is not a plan reaches it.
const FILE_MAX: u64 = 10 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Area {
    pub id: String,
    pub name: String,
    /// A GitHub label whose issues belong to this area.
    #[serde(default)]
    pub label: Option<String>,
    /// A GitHub milestone number whose issues belong to this area.
    #[serde(default)]
    pub milestone: Option<u64>,
    #[serde(default)]
    pub tasks: Vec<Task>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPlan {
    #[serde(default)]
    pub areas: Vec<Area>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressFile {
    schema_version: u32,
    #[serde(default)]
    areas: Vec<Area>,
}

/// A plan as it is on disk. The revision is the hash of the file's bytes, and a write must name the
/// revision it replaces.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub plan: ProgressPlan,
    pub revision: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ProgressDetection {
    None,
    Found {
        plan: ProgressPlan,
        revision: String,
    },
    Invalid {
        message: String,
    },
}

pub struct ProgressService;

fn progress_path(root: &Path) -> Result<PathBuf> {
    metadata_path(root, ".tbce/progress.json")
}

fn invalid(message: impl Into<String>) -> ServiceError {
    ServiceError::new("INVALID_PROGRESS", message)
}

/// The file's bytes, or nothing when there is no file.
fn contents(path: &Path) -> Result<Option<Vec<u8>>> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !file.metadata()?.is_file() {
        return Err(ServiceError::new(
            "NOT_FILE",
            "progress.json is not a regular file.",
        ));
    }
    let mut data = Vec::new();
    file.take(FILE_MAX + 1).read_to_end(&mut data)?;
    if data.len() as u64 > FILE_MAX {
        return Err(ServiceError::new(
            "TOO_LARGE",
            "progress.json is larger than 10 MiB.",
        ));
    }
    Ok(Some(data))
}

fn identifier(id: &str, seen: &mut HashSet<String>) -> Result<()> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || c == '-';
    if id.is_empty() || id.len() > ID_MAX || !id.chars().all(allowed) {
        return Err(invalid(format!("\"{id}\" is not a usable identifier.")));
    }
    if !seen.insert(id.to_string()) {
        return Err(invalid(format!("The identifier \"{id}\" is used twice.")));
    }
    Ok(())
}

fn text(value: &str, max: usize, what: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(invalid(format!("Enter {what}.")));
    }
    if value.chars().count() > max {
        return Err(invalid(format!(
            "\"{value}\" is longer than {max} characters."
        )));
    }
    if value.chars().any(char::is_control) {
        return Err(invalid(format!(
            "\"{value}\" contains a control character."
        )));
    }
    Ok(value.to_string())
}

/// A label as GitHub's issue list can filter by it. A comma would be read as two labels.
fn label(value: Option<String>) -> Result<Option<String>> {
    let Some(value) = value.map(|value| value.trim().to_string()) else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > LABEL_MAX
        || value.chars().any(char::is_control)
        || value.contains(',')
    {
        return Err(invalid(format!(
            "The label \"{value}\" cannot be used. Labels have at most {LABEL_MAX} characters and no commas."
        )));
    }
    Ok(Some(value))
}

/// Checks every limit and returns the plan as it will be stored: names, titles and labels trimmed,
/// and a blank label dropped.
fn normalize(plan: ProgressPlan) -> Result<ProgressPlan> {
    if plan.areas.len() > AREAS_MAX {
        return Err(invalid(format!("A project has at most {AREAS_MAX} areas.")));
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    let mut areas = Vec::with_capacity(plan.areas.len());
    for area in plan.areas {
        identifier(&area.id, &mut ids)?;
        let name = text(&area.name, NAME_MAX, "a name for every area")?;
        if !names.insert(name.to_lowercase()) {
            return Err(invalid(format!("There are two areas named \"{name}\".")));
        }
        if area.milestone == Some(0) {
            return Err(invalid(format!("{name}: that milestone cannot be used.")));
        }
        if area.tasks.len() > TASKS_MAX {
            return Err(invalid(format!(
                "{name}: an area has at most {TASKS_MAX} tasks."
            )));
        }
        let mut tasks = Vec::with_capacity(area.tasks.len());
        for task in area.tasks {
            identifier(&task.id, &mut ids)?;
            tasks.push(Task {
                id: task.id,
                title: text(&task.title, TITLE_MAX, "a title for every task")?,
                done: task.done,
            });
        }
        areas.push(Area {
            id: area.id,
            name,
            label: label(area.label)?,
            milestone: area.milestone,
            tasks,
        });
    }
    Ok(ProgressPlan { areas })
}

impl ProgressService {
    /// A file that cannot be used is reported, never repaired or replaced.
    pub fn read(root: &Path) -> Result<ProgressDetection> {
        let Some(data) = contents(&progress_path(root)?)? else {
            return Ok(ProgressDetection::None);
        };
        let file = match serde_json::from_slice::<ProgressFile>(&data) {
            Ok(file) => file,
            Err(error) => {
                return Ok(ProgressDetection::Invalid {
                    message: format!("progress.json could not be read: {error}"),
                })
            }
        };
        if file.schema_version != SCHEMA_VERSION {
            return Ok(ProgressDetection::Invalid {
                message: format!(
                    "progress.json uses schema version {}. TBCE supports version {SCHEMA_VERSION}.",
                    file.schema_version
                ),
            });
        }
        Ok(match normalize(ProgressPlan { areas: file.areas }) {
            Ok(plan) => ProgressDetection::Found {
                plan,
                revision: revision(&data),
            },
            Err(error) => ProgressDetection::Invalid {
                message: format!("progress.json cannot be used: {}", error.message),
            },
        })
    }

    /// Replaces the plan only if the file is still the one the interface read: `expected` is its
    /// revision, or nothing when there was no file. The new file is written beside the old one and
    /// moved over it, so a failure leaves the previous plan whole.
    pub fn write(root: &Path, plan: ProgressPlan, expected: Option<&str>) -> Result<Progress> {
        if !metadata_path(root, ".tbce/project.json")?.is_file() {
            return Err(ServiceError::new(
                "NOT_FOUND",
                "This folder is not a TBCE project yet. Convert it first.",
            ));
        }
        let plan = normalize(plan)?;
        let path = progress_path(root)?;
        let current = contents(&path)?.map(|data| revision(&data));
        if current.as_deref() != expected {
            return Err(ServiceError::new(
                "CONFLICT",
                "progress.json changed on disk since TBCE read it.",
            ));
        }
        let data = serde_json::to_vec_pretty(&ProgressFile {
            schema_version: SCHEMA_VERSION,
            areas: plan.areas.clone(),
        })
        .map_err(|error| ServiceError::new("INTERNAL", error.to_string()))?;
        let parent = path.parent().unwrap();
        fs::create_dir_all(parent)?;
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        file.write_all(&data)?;
        file.as_file().sync_all()?;
        file.persist(&path)
            .map_err(|error| ServiceError::from(error.error))?;
        Ok(Progress {
            plan,
            revision: revision(&data),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, title: &str, done: bool) -> Task {
        Task {
            id: id.into(),
            title: title.into(),
            done,
        }
    }

    fn area(id: &str, name: &str, tasks: Vec<Task>) -> Area {
        Area {
            id: id.into(),
            name: name.into(),
            label: None,
            milestone: None,
            tasks,
        }
    }

    fn plan() -> ProgressPlan {
        ProgressPlan {
            areas: vec![
                Area {
                    label: Some("area:auth".into()),
                    milestone: Some(3),
                    ..area(
                        "a1",
                        "Authentication",
                        vec![task("t1", "Login", true), task("t2", "Register", false)],
                    )
                },
                area("a2", "Teams", vec![]),
            ],
        }
    }

    fn project() -> tempfile::TempDir {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".tbce")).unwrap();
        fs::write(
            temp.path().join(".tbce/project.json"),
            r#"{"schemaVersion":1,"name":"Example"}"#,
        )
        .unwrap();
        temp
    }

    fn code(result: Result<Progress>) -> &'static str {
        result.expect_err("a refusal").code
    }

    #[test]
    fn a_project_without_a_plan_has_nothing_to_report() {
        let temp = project();
        assert!(matches!(
            ProgressService::read(temp.path()).unwrap(),
            ProgressDetection::None
        ));
    }

    #[test]
    fn a_written_plan_reads_back_with_the_same_revision() {
        let temp = project();
        let saved = ProgressService::write(temp.path(), plan(), None).unwrap();
        assert_eq!(saved.plan, plan());
        match ProgressService::read(temp.path()).unwrap() {
            ProgressDetection::Found {
                plan: read,
                revision,
            } => {
                assert_eq!(read, plan());
                assert_eq!(revision, saved.revision);
            }
            other => panic!("expected a plan, found {other:?}"),
        }
        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(temp.path().join(".tbce/progress.json")).unwrap())
                .unwrap();
        assert_eq!(value["schemaVersion"], SCHEMA_VERSION);
        assert_eq!(value["areas"][0]["label"], "area:auth");
        assert_eq!(value["areas"][0]["tasks"][0]["done"], true);
    }

    #[test]
    fn the_manifest_is_left_alone() {
        let temp = project();
        let before = fs::read(temp.path().join(".tbce/project.json")).unwrap();
        ProgressService::write(temp.path(), plan(), None).unwrap();
        assert_eq!(
            fs::read(temp.path().join(".tbce/project.json")).unwrap(),
            before
        );
    }

    #[test]
    fn a_plain_folder_cannot_hold_a_plan() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(
            code(ProgressService::write(temp.path(), plan(), None)),
            "NOT_FOUND"
        );
        assert!(!temp.path().join(".tbce").exists());
    }

    #[test]
    fn a_write_against_a_changed_file_is_refused() {
        let temp = project();
        let first = ProgressService::write(temp.path(), plan(), None).unwrap();
        // A second writer that never read the file, and one that read an older revision.
        assert_eq!(
            code(ProgressService::write(temp.path(), plan(), None)),
            "CONFLICT"
        );
        let mut changed = plan();
        changed.areas[0].tasks[1].done = true;
        let second =
            ProgressService::write(temp.path(), changed.clone(), Some(&first.revision)).unwrap();
        assert_ne!(first.revision, second.revision);
        assert_eq!(
            code(ProgressService::write(
                temp.path(),
                plan(),
                Some(&first.revision)
            )),
            "CONFLICT"
        );
        match ProgressService::read(temp.path()).unwrap() {
            ProgressDetection::Found { plan, .. } => assert_eq!(plan, changed),
            other => panic!("expected a plan, found {other:?}"),
        }
    }

    #[test]
    fn a_file_that_cannot_be_used_is_reported_and_never_replaced() {
        let temp = project();
        let path = temp.path().join(".tbce/progress.json");
        let duplicate =
            r#"{"schemaVersion":1,"areas":[{"id":"a","name":"A"},{"id":"b","name":"a"}]}"#;
        for data in [
            "not json".to_string(),
            format!(r#"{{"schemaVersion":{},"areas":[]}}"#, SCHEMA_VERSION + 1),
            duplicate.to_string(),
        ] {
            fs::write(&path, &data).unwrap();
            assert!(
                matches!(
                    ProgressService::read(temp.path()).unwrap(),
                    ProgressDetection::Invalid { .. }
                ),
                "{data}"
            );
            // The interface has no revision for such a file, so it cannot overwrite it.
            assert_eq!(
                code(ProgressService::write(temp.path(), plan(), None)),
                "CONFLICT"
            );
            assert_eq!(fs::read_to_string(&path).unwrap(), data);
        }
    }

    #[test]
    fn values_are_trimmed_and_a_blank_label_is_dropped() {
        let temp = project();
        let saved = ProgressService::write(
            temp.path(),
            ProgressPlan {
                areas: vec![Area {
                    label: Some("   ".into()),
                    ..area(
                        "a1",
                        "  Kimlik doğrulama  ",
                        vec![task("t1", " Giriş ", false)],
                    )
                }],
            },
            None,
        )
        .unwrap();
        assert_eq!(saved.plan.areas[0].name, "Kimlik doğrulama");
        assert_eq!(saved.plan.areas[0].label, None);
        assert_eq!(saved.plan.areas[0].tasks[0].title, "Giriş");
    }

    #[test]
    fn every_limit_is_enforced_before_anything_is_written() {
        let temp = project();
        let cases: Vec<ProgressPlan> = vec![
            ProgressPlan {
                areas: vec![area("a", " ", vec![])],
            },
            ProgressPlan {
                areas: vec![area("a", "Auth", vec![]), area("b", "AUTH", vec![])],
            },
            ProgressPlan {
                areas: vec![area("a", "Auth", vec![task("a", "Login", false)])],
            },
            ProgressPlan {
                areas: vec![area("a/b", "Auth", vec![])],
            },
            ProgressPlan {
                areas: vec![area(&"x".repeat(ID_MAX + 1), "Auth", vec![])],
            },
            ProgressPlan {
                areas: vec![area("a", &"n".repeat(NAME_MAX + 1), vec![])],
            },
            ProgressPlan {
                areas: vec![area("a", "Auth", vec![task("t", "", false)])],
            },
            ProgressPlan {
                areas: vec![area("a", "Auth", vec![task("t", "Log\u{7}in", false)])],
            },
            ProgressPlan {
                areas: vec![area(
                    "a",
                    "Auth",
                    vec![task("t", &"t".repeat(TITLE_MAX + 1), false)],
                )],
            },
            ProgressPlan {
                areas: vec![Area {
                    label: Some("auth,teams".into()),
                    ..area("a", "Auth", vec![])
                }],
            },
            ProgressPlan {
                areas: vec![Area {
                    label: Some("l".repeat(LABEL_MAX + 1)),
                    ..area("a", "Auth", vec![])
                }],
            },
            ProgressPlan {
                areas: vec![Area {
                    milestone: Some(0),
                    ..area("a", "Auth", vec![])
                }],
            },
            ProgressPlan {
                areas: (0..=AREAS_MAX)
                    .map(|n| area(&format!("a{n}"), &format!("Area {n}"), vec![]))
                    .collect(),
            },
            ProgressPlan {
                areas: vec![area(
                    "a",
                    "Auth",
                    (0..=TASKS_MAX)
                        .map(|n| task(&format!("t{n}"), "Task", false))
                        .collect(),
                )],
            },
        ];
        for (index, case) in cases.into_iter().enumerate() {
            assert_eq!(
                code(ProgressService::write(temp.path(), case, None)),
                "INVALID_PROGRESS",
                "case {index}"
            );
        }
        assert!(!temp.path().join(".tbce/progress.json").exists());
    }

    #[test]
    fn a_write_leaves_no_temporary_file_behind() {
        let temp = project();
        ProgressService::write(temp.path(), plan(), None).unwrap();
        let mut names: Vec<String> = fs::read_dir(temp.path().join(".tbce"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["progress.json", "project.json"]);
    }

    #[cfg(windows)]
    #[test]
    fn junctions_are_rejected_for_reads_and_writes() {
        use std::os::windows::process::CommandExt;
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(
            outside.path().join("project.json"),
            r#"{"schemaVersion":1,"name":"Elsewhere"}"#,
        )
        .unwrap();
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(temp.path().join(".tbce"))
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
            ProgressService::read(temp.path()).err().unwrap().code,
            "LINK_NOT_ALLOWED"
        );
        assert_eq!(
            code(ProgressService::write(temp.path(), plan(), None)),
            "LINK_NOT_ALLOWED"
        );
        assert!(!outside.path().join("progress.json").exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_rejected() {
        let temp = project();
        let outside = tempfile::tempdir().unwrap();
        let sentinel = outside.path().join("progress.json");
        fs::write(&sentinel, b"untouched").unwrap();
        std::os::unix::fs::symlink(&sentinel, temp.path().join(".tbce/progress.json")).unwrap();
        assert_eq!(
            ProgressService::read(temp.path()).err().unwrap().code,
            "LINK_NOT_ALLOWED"
        );
        assert_eq!(
            code(ProgressService::write(temp.path(), plan(), None)),
            "LINK_NOT_ALLOWED"
        );
        assert_eq!(fs::read(&sentinel).unwrap(), b"untouched");
    }
}
