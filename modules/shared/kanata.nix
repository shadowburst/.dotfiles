{ self, ... }:
{
  flake.nixosModules.kanata =
    { lib, pkgs, ... }:
    {
      hardware.uinput.enable = true;
      users.users.${self.username}.extraGroups = [
        "input"
        "uinput"
      ];
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
              spc (tap-hold $tap-time $hold-time spc ralt)

              a (tap-hold $tap-time $hold-time a lalt)
              s (tap-hold $tap-time $hold-time s lmet)
              d (tap-hold $tap-time $hold-time d lctl)
              f (tap-hold $tap-time $hold-time f lsft)
              j (tap-hold $tap-time $hold-time j rsft)
              k (tap-hold $tap-time $hold-time k rctl)
              l (tap-hold $tap-time $hold-time l rmet)
              ; (tap-hold $tap-time $hold-time ; lalt)
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
    };
}
