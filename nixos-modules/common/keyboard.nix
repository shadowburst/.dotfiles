{username, ...}: {
  hardware.uinput.enable = true;
  users.users.${username}.extraGroups = ["input" "uinput"];

  services.kanata = {
    enable = true;
    keyboards.default = {
      extraDefCfg = ''
        process-unmapped-keys yes
      '';
      config = ''
        (defsrc
          a s d f j k l ; bspc del
        )

        (defvar
          tap-time 200
          hold-time 200
        )

        (defalias
          a (multi f24 (tap-hold $tap-time $hold-time a ralt))
          s (multi f24 (tap-hold $tap-time $hold-time s lmet))
          d (multi f24 (tap-hold $tap-time $hold-time d lctl))
          f (multi f24 (tap-hold $tap-time $hold-time f lsft))
          j (multi f24 (tap-hold $tap-time $hold-time j rsft))
          k (multi f24 (tap-hold $tap-time $hold-time k rctl))
          l (multi f24 (tap-hold $tap-time $hold-time l rmet))
          ; (multi f24 (tap-hold $tap-time $hold-time ; ralt))
          bspc (tap-dance-eager $tap-time (
            (macro bspc)
            (macro C-bspc)
          ))
          del (tap-dance-eager $tap-time (
            (macro del)
            (macro C-del)
          ))
         )

        (deflayer base
          @a @s @d @f @j @k @l @; @bspc @del
        )
      '';
    };
  };
}
