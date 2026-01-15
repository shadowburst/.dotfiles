{username, ...}: {
  hardware.uinput.enable = true;
  users.users.${username}.extraGroups = ["input" "uinput"];
  environment.variables.GTK_IM_MODULE = "simple"; # Enables dead keys in GTK apps
  services.kanata = {
    enable = true;
    keyboards.default = {
      extraDefCfg = ''
        process-unmapped-keys yes
      '';
      config = ''
        (defsrc
          grv  1    2    3    4    5    6    7    8    9    0    -    =    bspc
          tab  q    w    e    r    t    y    u    i    o    p    [    ]    \
          caps a    s    d    f    g    h    j    k    l    ;    '    ret
          lsft z    x    c    v    b    n    m    ,    .    /    rsft
          lctl lmet lalt           spc            ralt rmet rctl
        )

        (defvar
          tap-time 200
          hold-time 200
        )

        (defalias
          spc (multi f24 (tap-hold $tap-time $hold-time spc ralt))

          a (multi f24 (tap-hold $tap-time $hold-time a lalt))
          s (multi f24 (tap-hold $tap-time $hold-time s lmet))
          d (multi f24 (tap-hold $tap-time $hold-time d lctl))
          f (multi f24 (tap-hold $tap-time $hold-time f lsft))
          j (multi f24 (tap-hold $tap-time $hold-time j rsft))
          k (multi f24 (tap-hold $tap-time $hold-time k rctl))
          l (multi f24 (tap-hold $tap-time $hold-time l rmet))
          ; (multi f24 (tap-hold $tap-time $hold-time ; lalt))
         )

        (deflayer default
          grv  1    2    3    4    5    6    7    8    9    0    -    =    bspc
          tab  q    w    e    r    t    y    u    i    o    p    [    ]    \
          caps @a   @s   @d   @f   g    h    @j   @k   @l   @;   '    ret
          lsft z    x    c    v    b    n    m    ,    .    /    rsft
          lctl lmet lalt           @spc           ralt rmet rctl
        )
      '';
    };
  };
}
