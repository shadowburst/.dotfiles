const customScss = `${App.configDir}/scss/main.scss`;
const customCss = '/tmp/ags/custom/main.css';
Utils.exec(`sass ${customScss} ${customCss}`);

App.resetCss();
App.applyCss(customCss);
