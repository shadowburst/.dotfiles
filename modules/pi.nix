_: {
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";
      piNpmPrefix = "${config.xdg.dataHome}/pi/npm";
      piNpmCache = "${config.xdg.cacheHome}/pi/npm";
      nodejsLts = pkgs.nodejs;

      piWithNpmExtensions = pkgs.symlinkJoin {
        name = "pi-coding-agent-with-npm-extensions";
        paths = [ pkgs.pi-coding-agent ];
        nativeBuildInputs = [ pkgs.makeWrapper ];

        postBuild = ''
          wrapProgram $out/bin/pi \
            --set NPM_CONFIG_PREFIX ${lib.escapeShellArg piNpmPrefix} \
            --set NPM_CONFIG_CACHE ${lib.escapeShellArg piNpmCache} \
            --prefix PATH : ${lib.escapeShellArg "${lib.makeBinPath [ nodejsLts ]}:${piNpmPrefix}/bin"}
        '';
      };

      mkPiConfigSymlink = path: {
        source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
      };
    in
    {
      programs.pi-coding-agent = {
        enable = true;
        package = piWithNpmExtensions;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

          Inside Herdr (`HERDR_ENV=1`), transfer each new worktree to a new agent before you change any file. Temporary worktrees that you remove in the same run stay with you.

          1. `herdr worktree open --cwd <main checkout> --path <worktree> --no-focus`; read `.result.root_pane.pane_id`.
          2. `herdr agent start <slug> --kind pi --pane <pane id>`, with `<slug>` matching `[a-z][a-z0-9_-]{0,31}`.
          3. `herdr agent prompt <slug> "<brief>"`, with the user's request verbatim, the base branch, and your decisions so far.
          4. When `herdr agent wait <slug> --until working --timeout 30000` succeeds, give the user the agent name and end your turn. When a step fails, continue in the worktree yourself.
        '';
        keybindings = {
          "tui.select.up" = [
            "up"
            "ctrl+p"
          ];
          "tui.select.down" = [
            "down"
            "ctrl+n"
          ];
          "app.model.cycleForward" = [ ];
        };
      };

      home.file = {
        ".pi/agent/themes" = mkPiConfigSymlink "config/pi/themes";
        ".pi/agent/settings.json" = mkPiConfigSymlink "config/pi/settings.json";
        ".pi/agent/skills/subagents" = mkPiConfigSymlink "config/pi/skills/subagents";
        ".pi/agent/tasks-config.json" = mkPiConfigSymlink "config/pi/tasks-config.json";
        ".pi/agent/extensions/prompt" = mkPiConfigSymlink "config/pi/extensions/prompt";
        ".pi/agent/extensions/auto-title.ts" = mkPiConfigSymlink "config/pi/extensions/auto-title.ts";
        ".pi/agent/extensions/footer" = mkPiConfigSymlink "config/pi/extensions/footer";
        ".pi/agent/extensions/question" = mkPiConfigSymlink "config/pi/extensions/question";
        ".pi/agent/extensions/subagents" = mkPiConfigSymlink "config/pi/extensions/subagents";
        ".pi/agent/extensions/tasks".source = pkgs.pi-tasks;
        ".pi/agent/extensions/usage" = mkPiConfigSymlink "config/pi/extensions/usage";
        ".pi/agent/extensions/pi-web-access".source = pkgs.pi-web-access;
        ".pi/agent/extensions/pi-claude-code".source = pkgs.pi-claude-code;
        ".pi/agent/extensions/ponytail".source = pkgs.ponytail;
      };
    };
}
