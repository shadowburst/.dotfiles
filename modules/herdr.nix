let
  # One table for the Herdr TUI (cli) and the Herdr desktop app (gui), so that
  # both answer the same keys. `tui` is the TUI action, `app` the app command;
  # null where the other one has no equivalent. Keys use the TUI spelling.
  keymap = [
    {
      key = "alt+space";
      tui = "goto";
      app = "mod.open:picker";
    }
    {
      key = "alt+b";
      tui = "toggle_sidebar";
      app = "layout.toggle:sidebar";
    }
    {
      key = "alt+tab";
      tui = "next_workspace";
      app = "space.next";
    }
    {
      key = "alt+shift+tab";
      tui = "previous_workspace";
      app = "space.prev";
    }
    # The app's alt+tab goes through the agents instead while the Inbox shows (keys.json).
    {
      key = "alt+up";
      tui = "previous_agent";
      app = null;
    }
    {
      key = "alt+down";
      tui = "next_agent";
      app = null;
    }
    {
      key = "alt+n";
      tui = "next_tab";
      app = "tab.next";
    }
    {
      key = "alt+p";
      tui = "previous_tab";
      app = "tab.prev";
    }
    {
      key = "alt+t";
      tui = "new_tab";
      app = "tab.new";
    }
    {
      key = "alt+h";
      tui = "focus_pane_left";
      app = "pane.go:left";
    }
    {
      key = "alt+j";
      tui = "focus_pane_down";
      app = "pane.go:down";
    }
    {
      key = "alt+k";
      tui = "focus_pane_up";
      app = "pane.go:up";
    }
    {
      key = "alt+l";
      tui = "focus_pane_right";
      app = "pane.go:right";
    }
    {
      key = "alt+f";
      tui = "zoom";
      app = "pane.zoom";
    }
    {
      key = "alt+q";
      tui = "close_pane";
      app = "pane.close";
    }
    {
      key = "alt+v";
      tui = "split_vertical";
      app = "pane.split:right";
    }
    {
      key = "alt+s";
      tui = "split_horizontal";
      app = "pane.split:down";
    }
    # The app resizes panes by dragging, and selects text with the mouse.
    {
      key = "alt+plus";
      tui = "resize_mode";
      app = null;
    }
    {
      key = "alt+esc";
      tui = "copy_mode";
      app = null;
    }
  ];

  # Plugin keys in the TUI, mod keys in the app.
  commands = [
    {
      # The code review: the reviewr pane in the TUI, the Changes panel in the app.
      key = "alt+r";
      tui = "persiyanov.reviewr.toggle";
      app = "sidebar-switch.changes";
    }
    {
      key = "alt+w";
      tui = "pbaudry.worktree.open";
      app = "mod.open:worktrees";
    }
  ];

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

  # The worktree popup: the naming command reads the request on stdin. The
  # first value of each list is the default in the popup.
  worktreeAgents = {
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
        "gpt-6.1-sol"
        "gpt-6-astra"
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
in
{
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      xdg.configFile."herdr/plugins/config/persiyanov.reviewr/config.toml".source =
        (pkgs.formats.toml { }).generate "herdr-reviewr-config.toml"
          {
            toggle_placement = "overlay";
            editor = "nvim +{line} {file}";
          };

      xdg.configFile."herdr/plugins/config/pbaudry.worktree/config.toml".source =
        (pkgs.formats.toml { }).generate "herdr-worktree-config.toml"
          {
            naming_command = [ (lib.getExe config.textGeneration.package) ];
            agents = worktreeAgents;
          };

      programs.herdr = {
        enable = true;
        plugins.reviewr.package = pkgs.herdr-reviewr;
        plugins.worktree.package = pkgs.herdr-worktree;
        settings = {
          onboarding = false;

          terminal.new_cwd = "follow";
          terminal.shell_mode = "auto";

          theme.name = "catppuccin";
          theme.custom.active_row_bg = config.catppuccin.palette.colors.mantle.hex;

          ui.confirm_close = false;
          ui.prompt_new_tab_name = false;
          ui.agent_panel_sort = "priority";
          ui.show_agent_labels_on_pane_borders = true;
          ui.toast.delivery = "herdr";
          ui.sidebar.agents.rows = [
            [
              {
                token = "terminal_title_stripped";
                fg = config.catppuccin.palette.colors.text.hex;
                bold = true;
                dim = false;
              }
            ]
            [
              {
                token = "workspace";
                fg = config.catppuccin.palette.colors.overlay0.hex;
                bold = false;
                dim = true;
              }
              {
                token = "agent";
                fg = config.catppuccin.palette.colors.overlay0.hex;
                bold = false;
                dim = true;
              }
            ]
            [
              "state_icon"
              "state_text"
            ]
          ];
          ui.sidebar.spaces.rows = [
            [
              {
                token = "workspace";
                fg = config.catppuccin.palette.colors.text.hex;
                bold = true;
                dim = false;
              }
            ]
            [
              {
                token = "branch";
                fg = config.catppuccin.palette.colors.overlay0.hex;
                bold = false;
                dim = true;
              }
              {
                token = "git_status";
                fg = config.catppuccin.palette.colors.overlay0.hex;
                bold = false;
                dim = true;
              }
              {
                token = "$pr";
                fg = config.catppuccin.palette.colors.green.hex;
                rules = [
                  {
                    contains = "";
                    fg = config.catppuccin.palette.colors.red.hex;
                    bold = false;
                  } # changes requested
                  {
                    contains = "";
                    fg = config.catppuccin.palette.colors.green.hex;
                    bold = true;
                  } # approved
                  {
                    contains = "";
                    fg = config.catppuccin.palette.colors.overlay0.hex;
                    bold = false;
                  } # draft
                  {
                    contains = "";
                    fg = config.catppuccin.palette.colors.mauve.hex;
                    bold = false;
                  } # merged
                  {
                    contains = "";
                    hide = true;
                  } # closed
                ];
              }
            ]
            [
              "state_icon"
              "state_text"
            ]
          ];
          advanced.scrollback_limit_bytes = 10485760;

          keys = lib.listToAttrs (map (k: lib.nameValuePair k.tui k.key) keymap) // {
            detach = "";
            switch_tab = "alt+1..9";

            # The worktree plugin (alt+w) does this through worktrunk.
            new_worktree = "";
            open_worktree = "";
            remove_worktree = "";
            command = map (c: {
              inherit (c) key;
              type = "plugin_action";
              command = c.tui;
            }) commands;
          };
        };
      };
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
      # The TUI's "alt+shift+tab" is the app's "alt-shift-tab".
      appKey = key: lib.replaceStrings [ "+" "esc" ] [ "-" "escape" ] key;
      appDir = "config/herdr-app";
      # A file Nix writes into the app's home, in the repo (git ignores it).
      appFile = name: ".dotfiles/${appDir}/${name}";
    in
    {
      home.packages = [
        pkgs.herdr-desktop
        pkgs.herdr-core # hc, for agents and skills
      ];

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
        agents = worktreeAgents;
        # OpenCode's models and efforts come from its service; only these providers show.
        opencode.providers = [
          "openai"
          "claude-agent"
        ];
      };

      home.file.${appFile "keys.json"}.source = json.generate "herdr-app-keys.json" {
        global =
          lib.listToAttrs (
            map (k: lib.nameValuePair (appKey k.key) k.app) (lib.filter (k: k.app != null) (keymap ++ commands))
          )
          // lib.listToAttrs (
            lib.concatLists (
              lib.imap1 (n: azerty: [
                (lib.nameValuePair "alt-${toString n}" "tab.select:${toString n}")
                (lib.nameValuePair "alt-${azerty}" "tab.select:${toString n}")
              ]) azertyDigits
            )
          )
          // {
            # The inbox layout: Spaces or Inbox in the sidebar, and settle the agent in view.
            "alt-i" = "sidebar-switch.sidebar";
            "alt-left" = "sidebar-switch.left";
            "alt-right" = "sidebar-switch.right";
            "alt-shift-s" = "t3-inbox.settle";

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
          # As kitty sends them for the TUI.
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

  flake.homeModules.core =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.programs.herdr;
      bin = if cfg.package == null then "herdr" else lib.getExe cfg.package;
      desired = lib.toJSON (
        lib.mapAttrsToList (_: plugin: "${toString plugin.package}/herdr-plugin.toml") cfg.plugins
      );
    in
    {
      options.programs.herdr.plugins = lib.mkOption {
        type =
          with lib.types;
          attrsOf (submodule {
            options.package = lib.mkOption {
              type = either package path;
              description = "Plugin package or directory containing herdr-plugin.toml.";
            };
          });
        default = { };
        description = "Plugins to register with Herdr; IDs are read from their manifests.";
      };

      config = lib.mkIf cfg.enable {
        home.activation.herdrPlugins = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
          # Listing falls back to the on-disk registry when the server is offline.
          # Do not reconcile an unreadable registry as though it were empty.
          if registered="$(${bin} plugin list --json)" \
            && printf '%s' "$registered" | ${lib.getExe pkgs.jq} -e '.result.plugins | type == "array"' >/dev/null; then
            printf '%s' "$registered" \
              | ${lib.getExe pkgs.jq} -r \
                --arg store ${lib.escapeShellArg "${builtins.storeDir}/"} \
                --argjson desired ${lib.escapeShellArg desired} '
                  .result.plugins[]
                  | select((.manifest_path // "") | startswith($store))
                  | select((.manifest_path as $p | $desired | index($p)) | not)
                  | .plugin_id
                ' \
              | while IFS= read -r id; do
                  # Unlink needs a live server; retry on the next activation if offline.
                  run ${bin} plugin unlink "$id" || true
                done

            printf '%s' "$registered" \
              | ${lib.getExe pkgs.jq} -r --argjson desired ${lib.escapeShellArg desired} '
                  ($desired - [.result.plugins[].manifest_path])[]
                ' \
              | while IFS= read -r manifest; do
                  # Link persists offline. Do not re-enable plugins disabled by the user.
                  run ${bin} plugin link "$manifest" || true
                done
          else
            echo "Skipping Herdr plugin registration: unable to read the registry." >&2
          fi
        '';
      };
    };
}
