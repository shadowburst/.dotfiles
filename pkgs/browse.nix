{ pkgs }:
pkgs.stdenvNoCC.mkDerivation rec {
  pname = "browse";
  version = "0.0.16";

  src = pkgs.fetchurl {
    url = "https://registry.npmjs.org/@opencode/browse-linux-x64-baseline/-/browse-linux-x64-baseline-${version}.tgz";
    hash = "sha512-3WK2017vgZmbXifboQxM+HVK+qrq9ci5R2cJm/rfPCZ/eCwuZAfVjkqrBq4ufZby8qvmItKH8itFlmZtXCp02g==";
  };

  nativeBuildInputs = with pkgs; [
    autoPatchelfHook
    makeWrapper
  ];
  # Stripping removes the embedded Bun application.
  dontStrip = true;
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 bin/browse $out/bin/browse
    install -Dm644 LICENSE $out/share/licenses/browse/LICENSE
    wrapProgram $out/bin/browse \
      --set OPENCODE_BROWSER_AUTO_UPDATE off \
      --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.xdg-utils ]}
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    test "$($out/bin/browse --version)" = "${version}"
    $out/bin/browse --help > /dev/null
    runHook postInstallCheck
  '';

  meta = {
    description = "Connect AI agents to a Chromium browser through MCP";
    homepage = "https://github.com/anomalyco/browse";
    license = pkgs.lib.licenses.mit;
    sourceProvenance = [ pkgs.lib.sourceTypes.binaryNativeCode ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "browse";
  };
}
