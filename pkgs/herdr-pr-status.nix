{ pkgs }:
let
  bin = pkgs.writeShellApplication {
    name = "herdr-pr-status";
    runtimeInputs = with pkgs; [
      gh
      git
      python3
    ];
    text = ''exec python3 ${./herdr-pr-status.py} "$@"'';
  };
  exe = pkgs.lib.getExe bin;
in
pkgs.writeTextDir "herdr-plugin.toml" ''
  id = "pbaudry.pr-status"
  name = "PR Status"
  version = "0.1.0"
  min_herdr_version = "0.9.1"
  description = "Shows the GitHub PR of each Space's branch as the $pr token and removes merged worktrees"
  platforms = ["linux"]

  # Long-running poller; it exits right away if one is already running.
  [[startup]]
  command = ["${exe}", "daemon"]

  [[events]]
  on = "workspace.focused"
  command = ["${exe}", "refresh"]

  [[events]]
  on = "workspace.created"
  command = ["${exe}", "refresh"]

  [[events]]
  on = "worktree.created"
  command = ["${exe}", "refresh"]

  [[actions]]
  id = "refresh"
  title = "PR status: refresh all Spaces"
  contexts = ["workspace"]
  command = ["${exe}", "refresh", "--all"]
''
