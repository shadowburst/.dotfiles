_: {
  flake.homeModules.claude-code =
    { lib, pkgs, ... }:
    {
      programs.claude-code = {
        enable = true;
        skills = ./skills;
        agents = {
          code-reviewer = ''
            ---
            name: code-reviewer
            description: Specialized code review agent
            tools: Read, Edit, Grep
            ---

            You are a senior software engineer specializing in code reviews.
            Focus on code quality, security, and maintainability.
          '';
        };
      };
    };
}
