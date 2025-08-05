{
  inputs,
  pkgs,
  ...
}: {
  home.packages = [
    (inputs.caelestia-shell.packages.${pkgs.system}.default.override
      {
        brightnessctl = pkgs.writeShellScriptBin "brightnessctl" ''
          exec ${pkgs.brightnessctl}/bin/brightnessctl --device=amdgpu_bl0 --min-value=4000 "$@"
        '';
      })
  ];
}
