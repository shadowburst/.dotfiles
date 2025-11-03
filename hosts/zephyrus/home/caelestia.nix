{
  inputs,
  pkgs,
  ...
}: {
  imports = [inputs.caelestia-shell.homeManagerModules.default];

  programs.caelestia.package =
    inputs.caelestia-shell.packages.${pkgs.stdenv.hostPlatform.system}.default.override
    {
      brightnessctl = pkgs.writeShellScriptBin "brightnessctl" ''
        exec ${pkgs.brightnessctl}/bin/brightnessctl --device=amdgpu_bl1 --min-value=4000 "$@"
      '';
    };
}
