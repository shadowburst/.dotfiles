_: {
  flake.homeModules.gui =
    { pkgs, ... }:
    {
      home.packages = [
        pkgs.wtype
      ];

      services.voxtype = {
        enable = true;
        package = pkgs.voxtype-vulkan;
        loadModels = [ "base.en" ];
        wayland.display = "wayland-1";

        settings = {
          hotkey.enabled = false;

          whisper = {
            model = "base.en";
            language = "en";
            context_window_optimization = true;
          };

          output = {
            mode = "type";
            wait_for_modifier_release = true;
            pre_type_delay_ms = 150;
            type_delay_ms = 10;
            append_text = " ";

            notification.on_transcription = false;
          };

          osd.enabled = false;

          text.filter_filler_words = true;
        };
      };
    };
}
