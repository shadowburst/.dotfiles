_: {
  flake.homeModules.voxtype =
    { pkgs, ... }:
    {
      services.voxtype = {
        enable = true;
        package = pkgs.voxtype-vulkan;
        loadModels = [ "base.en" ];

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
            append_text = " ";

            notification.on_transcription = false;
          };

          osd.enabled = false;

          text.filter_filler_words = true;
        };
      };
    };
}
