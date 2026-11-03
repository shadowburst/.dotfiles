{ inputs, self, ... }:
{
  flake.nixosModules.laravel =
    { ... }:
    {
      virtualisation.podman = {
        enable = true;
        dockerCompat = false;
        defaultNetwork.settings.dns_enabled = true;
      };

      virtualisation.containers.containersConf.settings.engine.runtime = "crun";

      users.users.${self.username}.linger = true;
    };

  flake.homeModules.laravel =
    { lib, pkgs, ... }:
    let
      lerd = inputs.lerd.packages.${pkgs.stdenv.hostPlatform.system}.lerd;
    in
    {
      home.packages = [
        lerd
        pkgs.nssTools
        pkgs.stripe-cli
        pkgs.tableplus
      ];

      home.file.".local/bin/lerd".source = lib.getExe lerd;

      home.sessionPath = [ "$HOME/.local/share/lerd/bin" ];

      # Lerd writes its Vite units without the NixOS system path, so `node_modules/.bin`
      # shims fail on `dirname`. This prefix drop-in covers every `lerd-vite-*` unit,
      # including the per-worktree ones `lerd worktree add` creates.
      xdg.configFile."systemd/user/lerd-vite-.service.d/nixos-path.conf".text = ''
        [Service]
        Environment=PATH=%h/.local/share/lerd/bin:%h/.local/bin:/run/wrappers/bin:/run/current-system/sw/bin:/usr/local/bin:/usr/bin:/bin
      '';
    };
}
