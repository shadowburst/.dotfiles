{ pkgs }:
let
  bin = pkgs.buildGoModule {
    pname = "herdr-worktree";
    version = "0.1.0";
    src = ./.;
    vendorHash = "sha256-Tf4YNxzTul1nhcr/3ehGkwCbTv0Idg4oJvcemEizGpk=";
    nativeBuildInputs = [ pkgs.makeWrapper ];
    nativeCheckInputs = [ pkgs.git ];
    postInstall = ''
      wrapProgram $out/bin/herdr-worktree \
        --prefix PATH : ${
          pkgs.lib.makeBinPath [
            pkgs.gh
            pkgs.git
            pkgs.worktrunk
          ]
        }
    '';
    meta.mainProgram = "herdr-worktree";
  };
  exe = pkgs.lib.getExe bin;
in
pkgs.writeTextDir "herdr-plugin.toml" ''
  id = "pbaudry.worktree"
  name = "Worktree"
  version = "0.1.0"
  min_herdr_version = "0.9.5"
  description = "Opens, creates, merges and removes worktrunk worktrees from one popup, starts an agent from a prompt, shows each Space's GitHub PR as the $pr token, and removes merged worktrees"
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

  [[actions]]
  id = "open"
  title = "Worktrees"
  contexts = ["global", "workspace", "pane"]
  command = ["${exe}", "open"]

  [[panes]]
  id = "popup"
  title = "Worktrees"
  placement = "popup"
  width = "90%"
  height = "80%"
  command = ["${exe}", "popup"]
''
