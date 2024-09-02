{ ... }:

{
  programs.gnome-disks.enable = true;
  services = {
    fstrim.enable = true;
    udisks2.enable = true;
  };
}
