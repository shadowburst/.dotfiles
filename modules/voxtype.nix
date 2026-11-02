_: {
  flake.homeModules.gui =
    { pkgs, ... }:
    {
      services.voxtype = {
        enable = true;
        package = pkgs.voxtype-vulkan;
        loadModels = [ "large-v3-turbo" ];
        wayland.display = "wayland-1";

        settings = {
          state_file = "auto";
          hotkey.enabled = false;

          whisper = {
            model = "large-v3-turbo";
            language = "auto";
            context_window_optimization = true;
          };

          audio.max_duration_secs = 300;

          output = {
            mode = "type";
            wait_for_modifier_release = true;
            pre_type_delay_ms = 150;
            type_delay_ms = 3;
            append_text = " ";

            notification = {
              on_recording_start = false;
              on_recording_stop = false;
              on_transcription = false;
              urgency = "normal";
            };
          };

          osd.enabled = false;
          text.filter_filler_words = true;
        };
      };
    };
}
