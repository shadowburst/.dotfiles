{
  inputs,
  pkgs,
  ...
}: {
  home.packages = [
    (inputs.caelestia-shell.packages.${pkgs.system}.default.override
      {
        brightnessctl = pkgs.writeShellScriptBin "brightnessctl" ''
          exec ${pkgs.brightnessctl}/bin/brightnessctl --min-value=10 "$@"
        '';
      })
  ];
}
