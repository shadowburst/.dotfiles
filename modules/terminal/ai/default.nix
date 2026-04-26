{ self, ... }:
{
  flake.homeModules.ai =
    { lib, pkgs, ... }:
    {
      imports = [
        self.homeModules.claude-code
        self.homeModules.opencode
        self.homeModules.ralphy
      ];
    };
}
