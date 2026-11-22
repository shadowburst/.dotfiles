let
  # alt+1..9 selects a tab. On AZERTY the top row types these characters.
  azertyDigits = [
    "&"
    "é"
    "\""
    "'"
    "("
    "-"
    "è"
    "_"
    "ç"
  ];
in
{
  # The core runs on every machine, so the app can open terminals on it.
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      home.packages = [ pkgs.herdr-core ];
    };

  flake.homeModules.gui =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      json = pkgs.formats.json { };
      colors = config.catppuccin.palette.colors;
      appDir = "config/herdr-app";
      # A file Nix writes into the app's home, in the repo (git ignores it).
      appFile = name: ".dotfiles/${appDir}/${name}";
    in
    {
      home.packages = [ pkgs.herdr-desktop ];

      # The whole home is one link to the repo, so layouts and mods are edited live
      # (the app reloads them on save). Not a link per folder: the app refuses to
      # draw a mod's icons through a link that leaves its home. Herdr also writes
      # its own files there; the folders' .gitignore keeps only ours.
      xdg.configFile."herdr-app".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/${appDir}";

      # Read-only: the settings screen and the zoom keys cannot save changes.
      home.file.${appFile "settings.json"}.source = json.generate "herdr-app-settings.json" {
        core = lib.getExe' pkgs.herdr-core "hc";
        font = config.stylix.fonts.monospace.name;
        font_size = 11;
        ui_font = config.stylix.fonts.sansSerif.name;
        theme = "catppuccin";
        telemetry = false;
        sounds.enabled = true;
      };

      home.file.${appFile "themes/catppuccin.json"}.source = json.generate "herdr-app-theme.json" {
        background = colors.base.hex;
        foreground = colors.text.hex;
        selection = colors.surface2.hex;
        cursor = colors.rosewater.hex;
        ansi = map (name: colors.${name}.hex) [
          "surface1"
          "red"
          "green"
          "yellow"
          "blue"
          "pink"
          "teal"
          "subtext1"
          "surface2"
          "red"
          "green"
          "yellow"
          "blue"
          "pink"
          "teal"
          "subtext0"
        ];
        colors = {
          chrome = colors.mantle.hex;
          canvas = colors.crust.hex;
          selected = colors.surface0.hex;
          accent = colors.mauve.hex;
        };
      };

      home.file.${appFile "worktrees.json"}.source = json.generate "herdr-app-worktrees.json" {
        naming_command = [ (lib.getExe config.textGeneration.package) ];
        # The first value of each list is the default in the popup.
        agents = {
          claude = {
            models = [
              "opus"
              "fable"
              "sonnet"
              "haiku"
            ];
            efforts = [
              "high"
              "medium"
              "low"
              "xhigh"
              "max"
            ];
          };
          codex = {
            models = [
              "gpt-6.2-sol"
              "gpt-6.2-astra"
              "gpt-6-luna"
            ];
            efforts = [
              "high"
              "medium"
              "low"
              "xhigh"
            ];
          };
        };
        # OpenCode's models and efforts come from its service; only these providers show.
        opencode.providers = [
          "openai"
          "claude-agent"
        ];
      };

      home.file.${appFile "programs.json"}.source = json.generate "herdr-app-programs.json" {
        programs.codex.run = [
          "codex"
          "--no-daemon"
        ];
      };

      home.file.${appFile "keys.json"}.source = json.generate "herdr-app-keys.json" {
        global =
          lib.listToAttrs (
            lib.concatLists (
              lib.imap1 (n: azerty: [
                (lib.nameValuePair "alt-${toString n}" "tab.select:${toString n}")
                (lib.nameValuePair "alt-${azerty}" "tab.select:${toString n}")
              ]) azertyDigits
            )
          )
          // {
            "alt-space" = "mod.open:picker";
            "alt-b" = "layout.toggle:sidebar";
            "alt-tab" = "space.next";
            "alt-shift-tab" = "space.prev";
            "alt-n" = "tab.next";
            "alt-p" = "tab.prev";
            "alt-t" = "tab.new";
            "alt-h" = "pane.go:left";
            "alt-j" = "pane.go:down";
            "alt-k" = "pane.go:up";
            "alt-l" = "pane.go:right";
            "alt-f" = "pane.zoom";
            "alt-q" = "pane.close";
            "alt-v" = "pane.split:right";
            "alt-s" = "pane.split:down";
            "alt-r" = "sidebar-switch.changes";
            "alt-w" = "mod.open:worktrees";

            # The inbox layout: Spaces or Inbox in the sidebar, and settle the agent in view.
            "alt-i" = "sidebar-switch.sidebar";
            "alt-left" = "sidebar-switch.left";
            "alt-right" = "sidebar-switch.right";
            "alt-shift-s" = "t3-inbox.settle";
            "alt-u" = "mod.open:usage";

            # The app's own keys, kept from its defaults.
            "ctrl-shift-p" = "app.palette";
            "ctrl-," = "app.settings";
            "ctrl-shift-l" = "layout.switch";
            "ctrl-shift-n" = "space.new";
            "ctrl-shift-w" = "tab.close";
            "ctrl-+" = "app.zoom_in";
            "ctrl-=" = "app.zoom_in";
            "ctrl--" = "app.zoom_out";
            "ctrl-0" = "app.zoom_reset";
            "f2" = "tab.rename";
            "shift-f2" = "space.rename";
          };
        # The inbox layout: alt+tab goes through the spaces or the agents, as the sidebar shows.
        "layout:inbox" = {
          "alt-tab" = "sidebar-switch.next";
          "alt-shift-tab" = "sidebar-switch.prev";
        };
        terminal = {
          # Readline word editing and movement.
          "ctrl-backspace" = builtins.fromJSON ''"send:\u0017"'';
          "ctrl-delete" = builtins.fromJSON ''"send:\u001bd"'';
          "ctrl-left" = builtins.fromJSON ''"send:\u001bb"'';
          "ctrl-right" = builtins.fromJSON ''"send:\u001bf"'';
          "ctrl-shift-c" = "terminal.copy";
          "ctrl-shift-v" = "terminal.paste";
          "ctrl-shift-f" = "terminal.search";
          "ctrl-v" = "terminal.paste_image";
        };
      };
    };
}
