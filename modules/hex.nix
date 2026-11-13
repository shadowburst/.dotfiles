{ inputs, ... }:
let
  hexSource = inputs.nixpkgs.legacyPackages.x86_64-linux.anomaly-hex.src;
in
{
  flake.homeModules.gui =
    { pkgs, ... }:
    {
      # Reuse the module shipped with the nixpkgs source, not Hex's flake package.
      imports = [ "${hexSource}/nix/hm-module.nix" ];

      programs.hex = {
        enable = true;
        package = pkgs.anomaly-hex;
        autostart = true;
        model = "whisper_large_v3_turbo";
        language = "auto";
        installModel = true;

        # Only these keys are reapplied; all other GUI settings remain mutable.
        settings = {
          shortcut_mode = "toggle";
        };
      };
    };
}
