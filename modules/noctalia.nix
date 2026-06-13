{ inputs, ... }:
{
  flake.nixosModules.gui =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.programs.noctalia.greeter;
      greeterPackage = config.programs.noctalia-greeter.package;
      greeterUser = config.services.greetd.settings.default_session.user or "greeter";

      xkbEnv = lib.filterAttrs (_: value: value != null && value != "") {
        XKB_DEFAULT_LAYOUT = cfg.keyboard.layout;
        XKB_DEFAULT_VARIANT = cfg.keyboard.variant;
        XKB_DEFAULT_OPTIONS = cfg.keyboard.options;
        XKB_DEFAULT_MODEL = cfg.keyboard.model;
      };

      xkbEnvCommand = lib.concatStringsSep " " (
        [ "${pkgs.coreutils}/bin/env" ]
        ++ lib.mapAttrsToList (name: value: "${name}=${lib.escapeShellArg value}") xkbEnv
      );

      greeterConfUpdates = lib.concatStringsSep "\n" (
        lib.optional (cfg.scale != null) "upsert_conf scale ${lib.escapeShellArg (toString cfg.scale)}"
        ++ lib.optional (cfg.output != null) "upsert_conf output ${lib.escapeShellArg ''"${cfg.output}"''}"
      );
    in
    {
      imports = [ inputs.noctalia-greeter.nixosModules.default ];

      options.programs.noctalia.greeter = {
        scale = lib.mkOption {
          type = lib.types.nullOr lib.types.float;
          default = null;
          description = ''
            Host/display-specific Noctalia Greeter scale. Written to mutable
            /var/lib/noctalia-greeter/greeter.conf while preserving UI-managed
            session/scheme choices.
          '';
        };

        output = lib.mkOption {
          type = lib.types.nullOr lib.types.str;
          default = null;
          example = "eDP-1";
          description = "Optional connector to pin Noctalia Greeter to.";
        };

        keyboard = {
          layout = lib.mkOption {
            type = lib.types.str;
            default = "fr";
            description = "XKB layout used by the Noctalia Greeter compositor.";
          };

          variant = lib.mkOption {
            type = lib.types.nullOr lib.types.str;
            default = "azerty";
            description = "XKB variant used by the Noctalia Greeter compositor.";
          };

          options = lib.mkOption {
            type = lib.types.nullOr lib.types.str;
            default = null;
            description = "XKB options used by the Noctalia Greeter compositor.";
          };

          model = lib.mkOption {
            type = lib.types.nullOr lib.types.str;
            default = null;
            description = "XKB model used by the Noctalia Greeter compositor.";
          };
        };
      };

      config = {
        programs.gpu-screen-recorder.enable = true;

        programs.noctalia-greeter.enable = true;

        services.greetd = {
          enable = true;
          useTextGreeter = false;
          settings.default_session = {
            user = "greeter";
            command = lib.mkForce "${xkbEnvCommand} ${greeterPackage}/bin/noctalia-greeter-session --";
          };
        };

        services.gnome.gnome-keyring.enable = true;
        security.pam.services.greetd.enableGnomeKeyring = true;

        system.activationScripts.noctaliaGreeterHostConfig.text = lib.mkIf (greeterConfUpdates != "") ''
          conf=/var/lib/noctalia-greeter/greeter.conf
          mkdir -p /var/lib/noctalia-greeter
          if [ ! -e "$conf" ]; then
            cat > "$conf" <<'EOF'
          # noctalia-greeter greeter.conf
          # default_session: admin default (Wayland session Name=)
          # session: last used (UI); scheme: color scheme name
          # output: Wayland connector; scale: UI scale; admin-only
          EOF
          fi

          upsert_conf() {
            key="$1"
            value="$2"
            tmp="$(mktemp)"
            if grep -q "^$key=" "$conf"; then
              sed "s|^$key=.*|$key=$value|" "$conf" > "$tmp"
            else
              cat "$conf" > "$tmp"
              printf '%s=%s\n' "$key" "$value" >> "$tmp"
            fi
            cat "$tmp" > "$conf"
            rm -f "$tmp"
          }

          ${greeterConfUpdates}

          chown ${greeterUser}:${greeterUser} "$conf" || true
          chmod 0640 "$conf"
        '';

        nix.settings = {
          extra-substituters = [ "https://noctalia.cachix.org" ];
          extra-trusted-public-keys = [
            "noctalia.cachix.org-1:pCOR47nnMEo5thcxNDtzWpOxNFQsBRglJzxWPp3dkU4="
          ];
        };
      };
    };

  flake.homeModules.gui =
    { config, ... }:
    {
      imports = [ inputs.noctalia.homeModules.default ];

      programs.noctalia = {
        enable = true;
        systemd.enable = true;
      };

      programs.satty.enable = true;

      xdg.configFile."noctalia/config.toml".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/config.toml";

      xdg.stateFile."noctalia/settings.toml".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/noctalia/settings.toml";
    };

  flake.nixosModules.zephyrus =
    { lib, pkgs, ... }:
    {
      programs.noctalia.greeter = {
        output = "eDP-1";
        scale = 1.5;
      };
    };
}
