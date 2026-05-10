_: {
  flake.nixosModules.hyprwhspr-rs =
    { lib, pkgs, ... }:
    {
      services.hyprwhspr-rs.enable = true;
    };

  flake.homeModules.hyprwhspr-rs =
    { lib, pkgs, ... }:
    let
      ggmlBaseEn = pkgs.fetchurl {
        url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
        hash = "sha256-oDd5yG3zMjB19eeWyyzlAp8A7Ihp7uP9+4l6/jbG0AI=";
      };
    in
    {
      home.file.".local/share/hyprwhspr-rs/models/ggml-base.en.bin".source = ggmlBaseEn;

      home.packages = [
        pkgs.hyprwhspr-rs
      ];

      wayland.windowManager.hyprland.settings = {
        bind = [
          "$mod, i, exec, hyprwhspr-rs record start"
        ];
        bindr = [
          "$mod, i, exec, hyprwhspr-rs record stop"
        ];
      };
    };
}
