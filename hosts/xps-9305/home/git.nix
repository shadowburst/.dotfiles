{lib, ...}: {
  programs.git.settings = {
    user.name = lib.mkForce "pbaudry";
    user.email = lib.mkForce "p.baudry@lynx-business.com";
  };
}
