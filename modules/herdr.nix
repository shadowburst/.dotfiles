_: {

  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      home.packages = with pkgs; [
        python3 # Needed for claude integration
      ];

      xdg.configFile."herdr-automatic-rename/config.sh".text = ''
        AUTO_INDEX=0
        TAB_CONTEXT=0
        AGENT_TRANSCRIPT=0
        MAX_TITLE_LEN=50
      '';

      home.activation.herdrIntegrations = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        run mkdir -p ${lib.escapeShellArg "${config.home.homeDirectory}/.pi/agent/extensions"}
        run ${pkgs.herdr}/bin/herdr integration install pi
        run ${pkgs.herdr}/bin/herdr integration install opencode
        run ${pkgs.herdr}/bin/herdr integration install claude
      '';

      programs.fish.interactiveShellInit = lib.mkAfter ''
        source ${pkgs.herdr-automatic-rename}/shell/hook.fish
      '';

      programs.herdr = {
        enable = true;
        plugins = {
          automatic-rename.package = pkgs.herdr-automatic-rename;
          reviewr.package = pkgs.herdr-reviewr;
        };
        settings = {
          onboarding = false;

          terminal.new_cwd = "follow";
          terminal.shell_mode = "auto";

          theme.name = "catppuccin";
          theme.custom.active_row_bg = config.catppuccin.palette.colors.mantle.hex;

          ui.confirm_close = false;
          ui.prompt_new_tab_name = false;
          ui.agent_panel_sort = "priority";
          ui.pane_gaps = false;
          ui.show_agent_labels_on_pane_borders = true;
          ui.status_indicators = "symbols";
          ui.sidebar.agents.row_gap = 1;
          ui.sidebar.spaces.row_gap = 1;
          ui.sidebar.agents.rows = [
            [
              "state_icon"
              {
                token = "tab";
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
          ];
          advanced.scrollback_limit_bytes = 10485760;

          keys = {
            command = [
              {
                key = "alt+r";
                type = "plugin_action";
                command = "persiyanov.reviewr.toggle";
              }
            ];

            detach = "";
            goto = "alt+space";
            toggle_sidebar = "alt+b";

            next_workspace = "alt+tab";
            previous_workspace = "alt+shift+tab";
            focus_agent = "alt+1..9";

            next_tab = "alt+n";
            previous_tab = "alt+p";
            new_tab = "alt+t";

            focus_pane_left = "alt+h";
            focus_pane_down = "alt+j";
            focus_pane_up = "alt+k";
            focus_pane_right = "alt+l";
            zoom = "alt+f";
            close_pane = "alt+q";
            split_vertical = "alt+v";
            split_horizontal = "alt+s";
            resize_mode = "alt+plus";

            copy_mode = "alt+esc";
          };
        };
      };
    };

  flake.homeModules.core =
    # Backport of https://github.com/nix-community/home-manager/pull/9815.
    # Remove this module once the pinned Home Manager provides programs.herdr.plugins.
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
