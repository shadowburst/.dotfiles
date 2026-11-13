#![cfg(unix)]

mod common;

use common::*;
use serde_json::json;

fn arm(s: &Session, t: &str, key: &str, cwd: &str) {
    let resume = json!({
        "key": key, "cwd": cwd,
        "argv": ["sh", "-c", "printf '%s\\n' \"$PWD\" > resumed; exec sleep 100"]
    });
    s.json(&["keep", t, "--resume", &resume.to_string()]);
}

fn lost(s: &Session) {
    let terminals: Vec<String> = s.json(&["ls"])["terminals"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["address"].as_str().unwrap().to_string())
        .collect();
    s.json(&["server", "stop"]);
    // Model long-lived agents without waiting through the existing crash-loop backoff.
    let path = s.root.join("state/herdr-core/test/terminals.json");
    let mut saved: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    for terminal in saved["terminals"].as_object_mut().unwrap().values_mut() {
        terminal["program_started_ms"] = json!(0);
    }
    std::fs::write(path, serde_json::to_vec(&saved).unwrap()).unwrap();
    s.json(&["server", "start"]);
    wait_until("kept terminals restarted", || terminals.iter().all(|t| get(s, t)["pid"].is_number()));
}

#[test]
fn a_saved_replacement_runs_once_in_the_same_terminal_and_directory() {
    let s = Session::new();
    let t = run(&s, &["--keep", "sleep", "100"]);
    let folder = s.root.to_str().unwrap();
    arm(&s, &t, "conversation", folder);
    let pid = get(&s, &t)["pid"].clone();
    s.json(&["server", "restart"]);
    assert_eq!(get(&s, &t)["pid"], pid, "a surviving process is not resumed");
    lost(&s);
    wait_until("replacement ran", || s.root.join("resumed").exists());
    assert_eq!(std::fs::read_to_string(s.root.join("resumed")).unwrap(), format!("{folder}\n"));
    assert_eq!(get(&s, &t)["state"], "live");
    assert!(get(&s, &t).get("resume").is_none(), "consumed before spawn");
    std::fs::remove_file(s.root.join("resumed")).unwrap();
    lost(&s);
    assert_ne!(get(&s, &t)["argv"][0], "sleep", "a second loss gets a shell");
    assert!(!s.root.join("resumed").exists());
}

#[test]
fn duplicate_conversations_have_only_one_replacement() {
    let s = Session::new();
    let a = run(&s, &["--keep", "sleep", "100"]);
    let b = run(&s, &["--keep", "sleep", "100"]);
    for t in [&a, &b] {
        arm(&s, t, "same-conversation", s.root.to_str().unwrap());
    }
    lost(&s);
    wait_until("replacement ran", || s.root.join("resumed").exists());
    let replaced = [&a, &b].into_iter().filter(|t| get(&s, t)["argv"].as_array().unwrap().len() == 3).count();
    assert_eq!(replaced, 1);
}

#[test]
fn a_replacement_still_claims_its_conversation_until_it_reports_again() {
    let s = Session::new();
    let a = run(&s, &["--keep", "sleep", "100"]);
    arm(&s, &a, "claimed", s.root.to_str().unwrap());
    let lose = |t: &str| {
        let old = get(&s, t)["pid"].as_i64().unwrap();
        unsafe {
            libc::kill(old as i32, libc::SIGKILL);
        }
        wait_until("replacement started", || get(&s, t)["pid"].as_i64().is_some_and(|pid| pid != old));
    };
    lose(&a);
    wait_until("replacement ran", || s.root.join("resumed").exists());
    let b = run(&s, &["--keep", "sleep", "100"]);
    arm(&s, &b, "claimed", s.root.to_str().unwrap());
    lose(&b);
    assert_ne!(get(&s, &b)["argv"].as_array().unwrap().len(), 3);
}

#[test]
fn clear_exit_and_kill_do_not_resume() {
    let s = Session::new();
    let a = run(&s, &["--keep", "sleep", "100"]);
    arm(&s, &a, "cleared", s.root.to_str().unwrap());
    s.json(&["keep", &a, "--clear-resume", "cleared"]);
    let b = run(&s, &["--keep", "sh", "-c", "read line"]);
    arm(&s, &b, "exited", s.root.to_str().unwrap());
    s.json(&["send", &b, "end"]);
    wait_until("normal exit", || get(&s, &b)["state"] == "finished");
    let c = run(&s, &["--keep", "sleep", "100"]);
    arm(&s, &c, "killed", s.root.to_str().unwrap());
    s.json(&["kill", &c]);
    lost(&s);
    assert_eq!(get(&s, &b)["state"], "finished");
    assert_eq!(get(&s, &c)["state"], "finished");
    assert!(!s.root.join("resumed").exists());
}

#[test]
fn missing_directory_falls_back_to_a_shell_and_invalid_commands_are_rejected() {
    let s = Session::new();
    let t = run(&s, &["--keep", "sleep", "100"]);
    arm(&s, &t, "gone", s.root.join("missing").to_str().unwrap());
    lost(&s);
    assert!(get(&s, &t).get("resume").is_none());
    assert!(!s.root.join("resumed").exists());
    let mut connection = s.connect();
    for resume in [
        json!({"key": "x", "cwd": ".", "argv": ["sh"]}),
        json!({"key": "x", "cwd": "/", "argv": []}),
        json!({"key": "x", "cwd": "/", "argv": ["sh", "bad\ncommand"]}),
    ] {
        let result = connection.call(1, "terminal.keep", json!({"terminal": t, "keep": true, "resume": resume}));
        assert!(result.get("error").is_some(), "{result}");
    }
}

#[test]
fn an_old_session_exit_cannot_clear_a_new_session() {
    let s = Session::new();
    let t = run(&s, &["--keep", "sleep", "100"]);
    arm(&s, &t, "new-session", s.root.to_str().unwrap());
    s.json(&["keep", &t, "--clear-resume", "old-session"]);
    assert_eq!(get(&s, &t)["resume"]["key"], "new-session");
    s.json(&["keep", &t, "--clear-resume", "new-session"]);
    assert!(get(&s, &t).get("resume").is_none());
}

#[test]
fn shutdown_exit_hooks_cannot_discard_the_saved_conversation() {
    let s = Session::new();
    let command = format!(
        "trap '\"{BIN}\" keep \"$HC_TERMINAL_ID\" --clear-resume conversation; exit 0' HUP TERM; echo ready; read line"
    );
    let t = run(&s, &["--keep", "sh", "-c", &command]);
    wait_until("exit hook installed", || text(&s, &t).contains("ready"));
    arm(&s, &t, "conversation", s.root.to_str().unwrap());
    lost(&s);
    wait_until("saved conversation resumed", || s.root.join("resumed").exists());
}
