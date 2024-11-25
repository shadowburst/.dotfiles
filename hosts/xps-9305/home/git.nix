{ lib, ... }:

{
  programs.git = {
    userName = lib.mkForce "pbaudry";
    userEmail = lib.mkForce "p.baudry@lynx-business.com";
  };
}
