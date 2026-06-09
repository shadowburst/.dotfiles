_: {
  flake.homeModules.voxtype =
    { pkgs, ... }:
    {
      services.voxtype = {
        enable = true;
        package = pkgs.voxtype-vulkan;
        loadModels = [ "base.en" ];
        wayland.display = "wayland-1";
        environment.PATH = pkgs.lib.makeBinPath [
          pkgs.coreutils
          pkgs.which
          pkgs.wl-clipboard
          pkgs.wtype
        ];

        settings = {
          hotkey.enabled = false;

          whisper = {
            model = "base.en";
            language = "en";
            context_window_optimization = true;
          };

          output = {
            # Avoid wtype's per-character synthetic text events being interpreted
            # through the active AZERTY layout as if they came from QWERTY.
            mode = "paste";
            # Use the normal clipboard paste chord. Terminal emulators are
            # configured to treat Ctrl+V as paste too; Shift+Insert can hit an
            # older selection instead of the freshly copied transcription.
            paste_keys = "ctrl+v";
            wait_for_modifier_release = true;
            append_text = " ";

            notification.on_transcription = false;
          };

          osd.enabled = false;

          text.filter_filler_words = true;
        };
      };
    };
}
